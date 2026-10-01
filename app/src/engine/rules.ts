// Правила игры: раздача, перечисление легальных ходов, применение хода.
//
// Коротко (полный текст — docs/RULES.*):
//  - набор 0–6, по 7 костей на руку, 14 в базаре;
//  - раунд открывает локомотив — дубль раунда (6-6 в первом, 0-0 в седьмом):
//    игрок выставляет его, а если дубля нет — тянет одну кость; не вытянул
//    нужный — ход переходит сопернику, и так по кругу, пока дубль не
//    найдётся; выставивший локомотив делает первый ход;
//  - от локомотива идут личные поезда игроков и общий мексиканский;
//  - ход — одна кость: на свой поезд, на мексиканский или на открытый
//    поезд соперника; ходить нечем — добор одной кости: подошла — ею
//    обязаны сходить, нет — свой поезд открывается, ход переходит;
//  - дубль обязан закрыть тот же игрок следующей костью; не закрыл — его
//    поезд открывается, а закрыть обязан соперник; пока дубль открыт,
//    играть можно только на него;
//  - «мёртвый» дубль — тот, к которому приставить уже нечего (все шесть
//    остальных костей с его числом на столе): он считается обычной костью,
//    закрывать его не нужно, поезд на нём закончен;
//  - раунд кончается, когда рука пуста и открытых дублей нет, либо когда
//    базар пуст и ходов нет ни у кого.

import { fullSet, hasValue, isDouble, otherValue, tileId, type TileId } from './tiles';
import { shuffle, type RngState } from './rng';
import { scoreRound } from './score';
import {
  HAND_SIZE,
  ROUNDS,
  TRAIN_IDS,
  otherPlayer,
  ownTrain,
  type GameState,
  type LogEntry,
  type Move,
  type Player,
  type RoundEndCause,
  type Train,
  type TrainId,
  type Variant,
} from './state';

// ---------------------------------------------------------------------------
// Начало раунда

export interface NewRoundOptions {
  readonly seed: RngState;
  /** Первый игрок раунда. */
  readonly first: Player;
  /** Номер раунда, с 0: локомотив 6-6 в раунде 0, 0-0 в раунде 6. */
  readonly round: number;
  readonly variant: Variant;
}

/** Число локомотива раунда. */
export function locoOf(round: number): number {
  if (!Number.isInteger(round) || round < 0 || round >= ROUNDS) {
    throw new Error(`Нет такого раунда: ${round}`);
  }
  return ROUNDS - 1 - round;
}

/** Дубль-локомотив раунда. */
export function locoTile(loco: number): TileId {
  return tileId(loco, loco);
}

/**
 * Раздача: 28 костей перемешиваются, по 7 в руки (первые семь — первому
 * игроку), 14 в базар в порядке добора. Локомотив ещё не выставлен.
 */
export function newRound(opts: NewRoundOptions): GameState {
  const loco = locoOf(opts.round);
  const [deck] = shuffle(fullSet(), opts.seed);
  const first = opts.first;
  const hands: [TileId[], TileId[]] = [[], []];
  hands[first] = deck.slice(0, HAND_SIZE);
  hands[otherPlayer(first)] = deck.slice(HAND_SIZE, 2 * HAND_SIZE);
  const empty = (open: boolean): Train => ({ tiles: [], end: loco, open });
  return {
    phase: 'loco',
    round: opts.round,
    loco,
    hands: [hands[0], hands[1]],
    boneyard: deck.slice(2 * HAND_SIZE),
    trains: { p0: empty(false), p1: empty(false), mx: empty(true) },
    current: first,
    first,
    seed: opts.seed,
    history: [],
    openDouble: null,
    mustPlay: null,
    passStreak: 0,
    seq: 0,
    variant: opts.variant,
    result: null,
    log: [],
  };
}

// ---------------------------------------------------------------------------
// Кости на столе

/** Костей с числом v в наборе: дубль и шесть остальных. */
const TILES_PER_VALUE = 7;

/**
 * Все ли кости с числом v уже лежат на столе (в поездах и в центре —
 * выставленный локомотив). Видно обоим игрокам: на руках и в базаре таких
 * костей не осталось.
 */
export function valueExhausted(state: GameState, v: number): boolean {
  let count = state.phase !== 'loco' && v === state.loco ? 1 : 0;
  for (const id of TRAIN_IDS) {
    for (const p of state.trains[id].tiles) {
      if (hasValue(p.tile, v)) count++;
    }
  }
  return count === TILES_PER_VALUE;
}

/** Поезд закончен: к его концу больше нечего приставить. */
export function isTrainDead(state: GameState, id: TrainId): boolean {
  return valueExhausted(state, state.trains[id].end);
}

// ---------------------------------------------------------------------------
// Легальные ходы

/** Поезда, на которые текущий игрок вправе класть кость. */
export function allowedTrains(state: GameState): TrainId[] {
  if (state.openDouble) return [state.openDouble.train];
  const own = ownTrain(state.current);
  return TRAIN_IDS.filter((id) => id === own || state.trains[id].open);
}

/** Поезда, на которые текущий игрок может положить именно эту кость. */
export function trainsForTile(state: GameState, tile: TileId): TrainId[] {
  return allowedTrains(state).filter((id) => hasValue(tile, state.trains[id].end));
}

/**
 * Все легальные ходы текущего игрока. Пока локомотив не выставлен —
 * выставить его, а без нужного дубля на руке — тянуть (дубль тогда в базаре,
 * базар не пуст). Дальше: если есть хоть одна выкладка — только выкладки
 * (ходить обязан); иначе добор, а при пустом базаре — пас. Пустой список
 * только при phase='over'.
 */
export function legalMoves(state: GameState): Move[] {
  if (state.phase === 'over') return [];
  if (state.phase === 'loco') {
    const holds = state.hands[state.current].includes(locoTile(state.loco));
    return [holds ? { type: 'loco' } : { type: 'draw' }];
  }
  const tiles = state.mustPlay ? [state.mustPlay] : state.hands[state.current];
  const moves: Move[] = [];
  for (const tile of tiles) {
    for (const train of trainsForTile(state, tile)) {
      moves.push({ type: 'place', tile, train });
    }
  }
  if (moves.length > 0) return moves;
  return [state.boneyard.length > 0 ? { type: 'draw' } : { type: 'pass' }];
}

/** Равенство ходов по существу: время обдумывания не сравнивается. */
export function moveEquals(a: Move, b: Move): boolean {
  if (a.type === 'place' && b.type === 'place') {
    return a.tile === b.tile && a.train === b.train;
  }
  return a.type === b.type;
}

// ---------------------------------------------------------------------------
// Применение хода

/** Применить ход. Бросает исключение, если ход нелегален. */
export function applyMove(state: GameState, move: Move): GameState {
  if (state.phase === 'over') throw new Error('Раунд окончен');
  if (!legalMoves(state).some((m) => moveEquals(m, move))) {
    throw new Error(`Нелегальный ход: ${JSON.stringify(move)}`);
  }
  const history = [...state.history, move];
  switch (move.type) {
    case 'loco':
      return applyLoco({ ...state, history });
    case 'place':
      return applyPlace({ ...state, history }, move.tile, move.train);
    case 'draw':
      return state.phase === 'loco'
        ? applyLocoDraw({ ...state, history })
        : applyDraw({ ...state, history });
    case 'pass':
      return applyPass({ ...state, history });
  }
}

function withHand(state: GameState, player: Player, hand: readonly TileId[]): GameState['hands'] {
  return player === 0 ? [hand, state.hands[1]] : [state.hands[0], hand];
}

function finish(state: GameState, cause: RoundEndCause): GameState {
  return {
    ...state,
    phase: 'over',
    mustPlay: null,
    result: scoreRound(state.hands, cause),
    log: [...state.log, { kind: 'end', cause }],
  };
}

/** Локомотив выставлен: начинается обычная игра, первый ход — у выставившего. */
function applyLoco(state: GameState): GameState {
  const me = state.current;
  const tile = locoTile(state.loco);
  return {
    ...state,
    phase: 'main',
    hands: withHand(
      state,
      me,
      state.hands[me].filter((t) => t !== tile),
    ),
    log: [...state.log, { kind: 'loco', player: me, tile }],
  };
}

/**
 * Добор в поисках локомотива: вытянул нужный дубль — остаётся при ходе и
 * выставляет его; нет — кость остаётся на руке, ход переходит сопернику.
 */
function applyLocoDraw(state: GameState): GameState {
  const me = state.current;
  // Нужного дубля нет на руках — он в базаре, базар не пуст.
  const tile = state.boneyard[0]!;
  const found = tile === locoTile(state.loco);
  return {
    ...state,
    hands: withHand(state, me, [...state.hands[me], tile]),
    boneyard: state.boneyard.slice(1),
    current: found ? me : otherPlayer(me),
    log: [...state.log, { kind: 'draw', player: me, tile, playable: found }],
  };
}

function applyPlace(state: GameState, tile: TileId, trainId: TrainId): GameState {
  const me = state.current;
  const train = state.trains[trainId];
  const inner = train.end;
  const outer = otherValue(tile, inner);
  const covers = state.openDouble !== null;
  const log: LogEntry[] = [...state.log, { kind: 'place', player: me, tile, train: trainId, covers }];
  // Владелец сыграл на свой открытый поезд — поезд закрывается.
  let open = train.open;
  if (trainId === ownTrain(me) && open) {
    open = false;
    log.push({ kind: 'close', train: trainId });
  }
  const hand = state.hands[me].filter((t) => t !== tile);
  const next: GameState = {
    ...state,
    hands: withHand(state, me, hand),
    trains: {
      ...state.trains,
      [trainId]: {
        tiles: [...train.tiles, { tile, values: [inner, outer], by: me, seq: state.seq }],
        end: outer,
        open,
      },
    },
    seq: state.seq + 1,
    mustPlay: null,
    passStreak: 0,
    openDouble: null,
    log,
  };
  let placed = next;
  if (isDouble(tile)) {
    if (!valueExhausted(next, outer)) {
      // Дубль закрывает тот же игрок: ход не переходит. Это верно и для
      // последней кости на руке — раунд не кончается, пока дубль открыт.
      return { ...next, openDouble: { train: trainId, value: outer, by: me } };
    }
    // «Мёртвый» дубль: продолжить его нечем — дальше как обычная кость.
    // Помечаем саму кость: стол кладёт её рубашкой вверх.
    const grown = next.trains[trainId];
    const lastIndex = grown.tiles.length - 1;
    const tiles = grown.tiles.map((p, i) => (i === lastIndex ? { ...p, dead: true as const } : p));
    placed = {
      ...next,
      trains: { ...next.trains, [trainId]: { ...grown, tiles } },
      log: [...log, { kind: 'dead', train: trainId }],
    };
  }
  // Рука пуста и открытых дублей нет — раунд окончен. Пустой может быть и
  // рука соперника: он выложил дубль последней костью, а мы его закрыли.
  if (hand.length === 0 || placed.hands[otherPlayer(me)].length === 0) {
    return finish(placed, 'out');
  }
  return { ...placed, current: otherPlayer(me) };
}

/** Игрок не смог сходить: его поезд открывается, ход (и открытый дубль) переходит. */
function failTurn(state: GameState): GameState {
  const me = state.current;
  const own = ownTrain(me);
  const train = state.trains[own];
  const opened = !train.open;
  return {
    ...state,
    trains: opened ? { ...state.trains, [own]: { ...train, open: true } } : state.trains,
    log: opened ? [...state.log, { kind: 'open', train: own }] : state.log,
    mustPlay: null,
    current: otherPlayer(me),
  };
}

function applyDraw(state: GameState): GameState {
  const me = state.current;
  // legalMoves отдаёт draw только при непустом базаре.
  const tile = state.boneyard[0]!;
  const drawn: GameState = {
    ...state,
    hands: withHand(state, me, [...state.hands[me], tile]),
    boneyard: state.boneyard.slice(1),
    passStreak: 0,
  };
  const playable = trainsForTile(drawn, tile).length > 0;
  const logged: GameState = {
    ...drawn,
    log: [...state.log, { kind: 'draw', player: me, tile, playable }],
  };
  // Подошла — ею обязаны сходить сразу; нет — остаётся на руке, ход переходит.
  return playable ? { ...logged, mustPlay: tile } : failTurn(logged);
}

function applyPass(state: GameState): GameState {
  const passStreak = state.passStreak + 1;
  const passed = failTurn({
    ...state,
    passStreak,
    log: [...state.log, { kind: 'pass', player: state.current }],
  });
  // Базар пуст, и подряд спасовали оба — игра заблокирована.
  return passStreak >= 2 ? finish(passed, 'blocked') : passed;
}
