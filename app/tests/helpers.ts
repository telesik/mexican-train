// Помощники для тестов: ручная сборка состояний и разыгрывание раундов.

import {
  BASE_VARIANT,
  applyMove,
  legalMoves,
  type GameState,
  type Move,
  locoTile,
  parseTile,
  type OpenDouble,
  type Phase,
  type Player,
  type TileId,
  type Train,
  type TrainId,
} from '../src/engine';

export interface TrainSpec {
  readonly end?: number;
  readonly open?: boolean;
  /** Кости, уже лежащие в поезде (порядок и стыковка для тестов не важны). */
  readonly tiles?: readonly TileId[];
}

/** Собрать состояние раунда вручную: руки, базар, концы поездов и, при надобности, кости на столе. */
export function makeState(opts: {
  hands: [TileId[], TileId[]];
  boneyard?: TileId[];
  loco?: number;
  phase?: Phase;
  trains?: Partial<Record<TrainId, TrainSpec>>;
  current?: Player;
  first?: Player;
  openDouble?: OpenDouble | null;
  mustPlay?: TileId | null;
  passStreak?: number;
}): GameState {
  const loco = opts.loco ?? 6;
  const train = (id: TrainId, open: boolean): Train => ({
    tiles: (opts.trains?.[id]?.tiles ?? []).map((tile, seq) => {
      const { hi, lo } = parseTile(tile);
      return { tile, values: [hi, lo] as const, by: 0 as const, seq };
    }),
    end: opts.trains?.[id]?.end ?? loco,
    open: opts.trains?.[id]?.open ?? open,
  });
  return {
    phase: opts.phase ?? 'main',
    round: 6 - loco,
    loco,
    hands: [opts.hands[0], opts.hands[1]],
    boneyard: opts.boneyard ?? [],
    trains: { p0: train('p0', false), p1: train('p1', false), mx: train('mx', true) },
    current: opts.current ?? 0,
    first: opts.first ?? 0,
    seed: 1,
    history: [],
    openDouble: opts.openDouble ?? null,
    mustPlay: opts.mustPlay ?? null,
    passStreak: opts.passStreak ?? 0,
    seq: 0,
    variant: BASE_VARIANT,
    result: null,
    log: [],
  };
}

export function place(tile: TileId, train: TrainId): Move {
  return { type: 'place', tile, train };
}

export const LOCO: Move = { type: 'loco' };
export const DRAW: Move = { type: 'draw' };
export const PASS: Move = { type: 'pass' };

/** Лёгкий детерминированный генератор для выбора ходов в симуляции. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Доиграть раунд случайной политикой; возвращает конечное состояние. */
export function playout(start: GameState, rand: () => number, maxMoves = 500): GameState {
  let state = start;
  for (let i = 0; i < maxMoves && state.phase !== 'over'; i++) {
    const moves = legalMoves(state);
    state = applyMove(state, moves[Math.floor(rand() * moves.length)]!);
  }
  return state;
}

/** Все кости состояния: руки, базар, поезда и выставленный локомотив — для проверки сохранения набора. */
export function allTiles(state: GameState): TileId[] {
  return [
    ...(state.phase === 'loco' ? [] : [locoTile(state.loco)]),
    ...state.hands[0],
    ...state.hands[1],
    ...state.boneyard,
    ...state.trains.p0.tiles.map((p) => p.tile),
    ...state.trains.p1.tiles.map((p) => p.tile),
    ...state.trains.mx.tiles.map((p) => p.tile),
  ];
}
