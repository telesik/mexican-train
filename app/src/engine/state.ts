// Типы состояния раунда «Мексиканского поезда» (набор 0–6, два игрока).
// Состояние полностью сериализуемо (JSON) и детерминированно выводится из
// (seed, first, round, variant) и списка ходов: это основа реплея, бота и
// сетевой партии «на общем seed».
//
// Геометрии стола в состоянии нет: поезда линейны, раскладка — забота
// рендерера.

import type { TileId } from './tiles';
import type { RngState } from './rng';

export type Player = 0 | 1;

/** Поезд: личный игрока 0, личный игрока 1, общий «мексиканский». */
export type TrainId = 'p0' | 'p1' | 'mx';

/** Порядок перечисления поездов — фиксированный (от него зависит порядок legalMoves). */
export const TRAIN_IDS: readonly TrainId[] = ['p0', 'p1', 'mx'];

/** Раундов в матче: локомотивы 6-6, 5-5, …, 0-0. */
export const ROUNDS = 7;

/** Костей на руку при раздаче. */
export const HAND_SIZE = 7;

export function ownTrain(player: Player): TrainId {
  return player === 0 ? 'p0' : 'p1';
}

export function otherPlayer(player: Player): Player {
  return (1 - player) as Player;
}

export interface PlacedTile {
  readonly tile: TileId;
  /** Числа половинок: [к локомотиву, наружу]. У дубля совпадают. */
  readonly values: readonly [number, number];
  /** Игрок, выложивший кость. */
  readonly by: Player;
  /** Сквозной порядковый номер выкладывания в раунде, с 0. */
  readonly seq: number;
}

export interface Train {
  readonly tiles: readonly PlacedTile[];
  /** Открытое число на конце поезда; у пустого поезда — число локомотива. */
  readonly end: number;
  /**
   * Открыт ли поезд для соперника. Личный открывается, когда владелец не
   * смог сходить, и закрывается, когда владелец сам сыграл на него.
   * Мексиканский открыт всегда.
   */
  readonly open: boolean;
}

/**
 * loco — локомотив раунда ещё не выставлен: игроки по очереди выставляют
 * нужный дубль или тянут по одной кости; main — обычная игра; over — конец.
 */
export type Phase = 'loco' | 'main' | 'over';

/** out — игрок выложил последнюю кость; blocked — базар пуст, ходов нет ни у кого. */
export type RoundEndCause = 'out' | 'blocked';

export interface RoundResult {
  readonly cause: RoundEndCause;
  /** Суммы очков на руках (одинокая 0-0 — 25). */
  readonly sums: readonly [number, number];
  /** Сколько прибавлено к счёту матча каждого: своя сумма на руке. */
  readonly added: readonly [number, number];
  /** У кого сумма меньше; null — поровну. */
  readonly winner: Player | null;
}

export type LogEntry =
  | { readonly kind: 'loco'; readonly player: Player; readonly tile: TileId }
  | {
      readonly kind: 'place';
      readonly player: Player;
      readonly tile: TileId;
      readonly train: TrainId;
      /** Кость закрыла открытый дубль. */
      readonly covers: boolean;
    }
  | { readonly kind: 'draw'; readonly player: Player; readonly tile: TileId; readonly playable: boolean }
  | { readonly kind: 'pass'; readonly player: Player }
  /** Выложен «мёртвый» дубль: продолжить его нечем, поезд на нём закончен. */
  | { readonly kind: 'dead'; readonly train: TrainId }
  | { readonly kind: 'open'; readonly train: TrainId }
  | { readonly kind: 'close'; readonly train: TrainId }
  | { readonly kind: 'end'; readonly cause: RoundEndCause };

/**
 * Вариант правил. Сейчас один: набор 0–6, два игрока, 7 раундов. Поле —
 * номер редакции правил: будущие модификации получают свои поля, а сеть
 * сверяет варианты целиком.
 */
export interface Variant {
  readonly v: 1;
}

export const BASE_VARIANT: Variant = { v: 1 };

/** Открытый дубль: пока он не закрыт, играть можно только на него. */
export interface OpenDouble {
  readonly train: TrainId;
  /** Число дубля. */
  readonly value: number;
  /** Кто выложил дубль. */
  readonly by: Player;
}

export interface GameState {
  readonly phase: Phase;
  /** Номер раунда, с 0. */
  readonly round: number;
  /**
   * Число локомотива раунда. Сам дубль loco-loco участвует в раздаче: он на
   * руке или в базаре, пока phase='loco', и в центре стола — после.
   */
  readonly loco: number;
  /** Руки игроков; индексы 0/1 — постоянные на весь матч. */
  readonly hands: readonly [readonly TileId[], readonly TileId[]];
  /** Базар в порядке добора: тянут первую кость. Порядок задан seed. */
  readonly boneyard: readonly TileId[];
  readonly trains: Readonly<Record<TrainId, Train>>;
  readonly current: Player;
  /** Первый игрок раунда. */
  readonly first: Player;
  /** Seed раунда: вместе с history образует протокол. */
  readonly seed: RngState;
  /** Протокол раунда: применённые ходы по порядку. */
  readonly history: readonly Move[];
  /** Открытый дубль, который обязан закрыть текущий игрок. */
  readonly openDouble: OpenDouble | null;
  /** Вытянутая из базара кость, которой игрок обязан сходить (в фазе loco не используется). */
  readonly mustPlay: TileId | null;
  /** Подряд идущие пасы: два — игра заблокирована. */
  readonly passStreak: number;
  /** Номер следующей выкладываемой кости. */
  readonly seq: number;
  readonly variant: Variant;
  readonly result: RoundResult | null;
  readonly log: readonly LogEntry[];
}

export type Move =
  /** Выставить локомотив раунда (только в фазе loco). */
  | { readonly type: 'loco'; readonly t?: number }
  | {
      readonly type: 'place';
      readonly tile: TileId;
      readonly train: TrainId;
      /**
       * Время обдумывания хода, мс. Правилам и легальности безразлично
       * (moveEquals его не сравнивает), в историю и протокол попадает как есть.
       */
      readonly t?: number;
    }
  | { readonly type: 'draw'; readonly t?: number }
  | { readonly type: 'pass'; readonly t?: number };
