// Бот. Честный: в состоянии раунда лежат и рука соперника, и порядок
// базара (партия выводится из общего seed), но бот их не читает. Он знает
// только то, что видит игрок за столом: свою руку, кости на столе, число
// костей у соперника и в базаре, журнал ходов без чужих вытянутых костей
// (из записи о чужом доборе он берёт только «чего у соперника не было»).
//
// Сила — сэмплированием: бот много раз «досдаёт» невидимые кости случайным
// образом, согласованным с тем, что известно (если соперник тянул из базара,
// значит, костей под тогдашние концы у него не было), доигрывает каждый
// расклад простой жадной политикой и выбирает ход с лучшим средним итогом.

import { fullSet, hasValue, pipSum, type TileId } from './tiles';
import { shuffle, nextInt, type RngState } from './rng';
import { applyMove, legalMoves, locoTile } from './rules';
import type { BotLevel } from './match';
import {
  TRAIN_IDS,
  otherPlayer,
  ownTrain,
  type GameState,
  type Move,
  type Player,
} from './state';

export interface BotOptions {
  /** Сила бота; по умолчанию normal. */
  readonly level?: BotLevel;
  /**
   * Seed случайности бота. При одном seed и одной видимой картине выбор
   * одинаков. По умолчанию выводится из seed раунда и номера хода.
   */
  readonly seed?: RngState;
}

interface LevelParams {
  /** Сколько раскладов невидимых костей перебирается. */
  readonly samples: number;
  /**
   * Неточность: ход выбирается случайно среди тех, чей средний итог не хуже
   * лучшего на столько очков. 0 — всегда лучший.
   */
  readonly slack: number;
}

const LEVELS: Record<BotLevel, LevelParams> = {
  easy: { samples: 2, slack: 8 },
  normal: { samples: 8, slack: 0 },
  strong: { samples: 32, slack: 0 },
};

/** Выбрать ход за текущего игрока. Бросает исключение, если раунд окончен. */
export function chooseBotMove(state: GameState, opts: BotOptions = {}): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('Раунд окончен');
  // Единственный ход — выставить локомотив, тянуть, пасовать, обязательная кость.
  if (moves.length === 1) return moves[0]!;
  const level = LEVELS[opts.level ?? 'normal'];
  let rng: RngState = (opts.seed ?? defaultSeed(state)) >>> 0;
  const me = state.current;

  const worlds: GameState[] = [];
  for (let i = 0; i < level.samples; i++) {
    const [world, next] = determinize(state, me, rng);
    worlds.push(world);
    rng = next;
  }
  // Средний итог хода по всем раскладам: насколько соперник наберёт больше меня.
  const values = moves.map((move) => {
    let total = 0;
    for (const world of worlds) total += playoutValue(applyMove(world, move), me);
    return total / worlds.length;
  });
  const best = Math.max(...values);
  const near = moves.filter((_, i) => values[i]! >= best - level.slack);
  const [pick] = nextInt(rng, near.length);
  return near[pick]!;
}

function defaultSeed(state: GameState): RngState {
  return (state.seed ^ Math.imul(state.history.length + 1, 0x9e3779b1)) >>> 0;
}

/** Жадная оценка хода: сбрасывать тяжёлые кости, при равенстве — на свой поезд. */
function greedyScore(state: GameState, move: Move): number {
  if (move.type !== 'place') return 0;
  return pipSum(move.tile) + (move.train === ownTrain(state.current) ? 0.5 : 0);
}

function greedyMove(state: GameState): Move {
  const moves = legalMoves(state);
  let best = moves[0]!;
  let bestScore = greedyScore(state, best);
  for (const m of moves) {
    const score = greedyScore(state, m);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Доиграть раунд жадной политикой; итог — насколько соперник набрал больше меня. */
function playoutValue(start: GameState, me: Player): number {
  let state = start;
  while (state.phase !== 'over') state = applyMove(state, greedyMove(state));
  const added = state.result!.added;
  return added[otherPlayer(me)] - added[me];
}

/**
 * Числа, которых у соперника точно нет: когда он последний раз тянул из
 * базара или пасовал, ни одна его кость не подходила к доступным ему концам
 * (они записаны в журнале — это видели оба). После этого рука только убывала;
 * если он тянул снова, берётся более свежая запись.
 */
export function voidValues(state: GameState, me: Player): readonly number[] {
  const opp = otherPlayer(me);
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i]!;
    if ((e.kind === 'draw' || e.kind === 'pass') && e.player === opp) return e.lacks;
  }
  return [];
}

/**
 * Один расклад невидимых костей: рука соперника и базар разыгрываются заново
 * из того, чего бот не видит, с учётом известных пустых чисел соперника.
 */
export function determinize(state: GameState, me: Player, rng: RngState): [GameState, RngState] {
  const opp = otherPlayer(me);
  // Бот выбирает только в обычной игре: локомотив уже на столе.
  const seen = new Set<TileId>([locoTile(state.loco), ...state.hands[me]]);
  for (const id of TRAIN_IDS) for (const p of state.trains[id].tiles) seen.add(p.tile);
  const unseen = fullSet().filter((t) => !seen.has(t));
  const voids = voidValues(state, me);
  const need = state.hands[opp].length;
  const fits = unseen.filter((t) => voids.every((v) => !hasValue(t, v)));
  // Знание из журнала не должно делать расклад невозможным.
  const pool = fits.length >= need ? fits : unseen;
  const [mixed, r1] = shuffle(pool, rng);
  const hand = mixed.slice(0, need);
  const taken = new Set(hand);
  const [boneyard, r2] = shuffle(
    unseen.filter((t) => !taken.has(t)),
    r1,
  );
  const hands: GameState['hands'] = me === 0 ? [state.hands[0], hand] : [hand, state.hands[1]];
  return [{ ...state, hands, boneyard }, r2];
}
