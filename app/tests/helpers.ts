// Помощники для тестов: ручная сборка состояний и разыгрывание раундов.

import {
  BASE_VARIANT,
  applyMove,
  legalMoves,
  type GameState,
  type Move,
  type OpenDouble,
  type Player,
  type TileId,
  type Train,
  type TrainId,
} from '../src/engine';

export interface TrainSpec {
  readonly end?: number;
  readonly open?: boolean;
}

/** Собрать состояние раунда вручную. Поезда пустые (без истории костей), но с нужными концами. */
export function makeState(opts: {
  hands: [TileId[], TileId[]];
  boneyard?: TileId[];
  loco?: number;
  trains?: Partial<Record<TrainId, TrainSpec>>;
  current?: Player;
  first?: Player;
  openDouble?: OpenDouble | null;
  mustPlay?: TileId | null;
  passStreak?: number;
}): GameState {
  const loco = opts.loco ?? 6;
  const train = (id: TrainId, open: boolean): Train => ({
    tiles: [],
    end: opts.trains?.[id]?.end ?? loco,
    open: opts.trains?.[id]?.open ?? open,
  });
  return {
    phase: 'main',
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

/** Все кости состояния: руки, базар, поезда — для проверки сохранения набора. */
export function allTiles(state: GameState): TileId[] {
  return [
    ...state.hands[0],
    ...state.hands[1],
    ...state.boneyard,
    ...state.trains.p0.tiles.map((p) => p.tile),
    ...state.trains.p1.tiles.map((p) => p.tile),
    ...state.trains.mx.tiles.map((p) => p.tile),
  ];
}
