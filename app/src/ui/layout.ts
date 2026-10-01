// Раскладка стола: локомотив слева, от него три поезда рядами вправо —
// сверху поезд соперника, посередине мексиканский, снизу свой. Поезд идёт
// «змейкой»: дошёл до края ряда — кость поворачивает вниз, следующий ряд
// идёт обратно. Дубли лежат поперёк. Чистая геометрия в клетках сцены, без
// DOM: правилам раскладка безразлична, а тестам нужна точность.

import { isDouble, type TileId } from '../engine/tiles';
import { ownTrain, type GameState, type Player, type TrainId } from '../engine/state';

export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** Место кости: клетка a — к локомотиву, b — наружу (у дубля — две половины поперёк пути). */
export interface Slot {
  readonly a: Vec;
  readonly b: Vec;
}

export interface TrainLayout {
  readonly id: TrainId;
  /** Места выложенных костей по порядку. */
  readonly slots: readonly Slot[];
  /** Куда встанет следующая кость: обычная и дубль. */
  readonly next: { readonly tile: Slot; readonly double: Slot };
  /** Линия первого ряда поезда. */
  readonly top: number;
  /** Линия последнего ряда (с учётом места следующей кости). */
  readonly bottom: number;
}

export interface TableLayout {
  /** Локомотив: дубль стоймя слева от поездов. */
  readonly loco: Slot;
  /** Поезда сверху вниз: соперника, мексиканский, свой. */
  readonly trains: readonly TrainLayout[];
  /** Границы содержимого в клетках (с полями). */
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };
}

/** Столбец, с которого начинаются поезда (между ним и локомотивом — «рельсы»). */
export const TRAIN_X = 2;
/** Шаг рядов одного поезда. */
const ROW_PITCH = 2;
/** Расстояние между последним рядом одного поезда и первым рядом следующего. */
const TRAIN_GAP = 3;

interface Cursor {
  readonly x: number;
  readonly y: number;
  readonly dir: 1 | -1;
  /** Сколько клеток ряда занято. */
  readonly used: number;
  /** Предыдущая кость — дубль: сразу за ним не поворачиваем. */
  readonly afterDouble: boolean;
}

/** Поставить кость в курсор: место кости и курсор после неё. */
function step(c: Cursor, double: boolean, rowCells: number): { slot: Slot; next: Cursor } {
  const len = double ? 1 : 2;
  const turn = c.used > 0 && c.used + len > rowCells && !c.afterDouble;
  if (!turn) {
    if (double) {
      return {
        slot: { a: { x: c.x, y: c.y - 0.5 }, b: { x: c.x, y: c.y + 0.5 } },
        next: { ...c, x: c.x + c.dir, used: c.used + 1, afterDouble: true },
      };
    }
    return {
      slot: { a: { x: c.x, y: c.y }, b: { x: c.x + c.dir, y: c.y } },
      next: { ...c, x: c.x + 2 * c.dir, used: c.used + 2, afterDouble: false },
    };
  }
  // Поворот: кость уходит вниз под последнюю клетку ряда, следующий ряд идёт обратно.
  const col = c.x - c.dir;
  const dir = -c.dir as 1 | -1;
  const y = c.y + ROW_PITCH;
  if (double) {
    return {
      slot: { a: { x: col - 0.5, y: c.y + 1 }, b: { x: col + 0.5, y: c.y + 1 } },
      next: { x: col, y, dir, used: 0, afterDouble: true },
    };
  }
  return {
    slot: { a: { x: col, y: c.y + 1 }, b: { x: col, y } },
    next: { x: col + dir, y, dir, used: 1, afterDouble: false },
  };
}

/** Раскладка одного поезда от линии top; rowCells — вместимость ряда в клетках. */
export function layoutTrain(
  id: TrainId,
  tiles: readonly TileId[],
  top: number,
  rowCells: number,
): TrainLayout {
  let cursor: Cursor = { x: TRAIN_X, y: top, dir: 1, used: 0, afterDouble: false };
  const slots: Slot[] = [];
  for (const tile of tiles) {
    const r = step(cursor, isDouble(tile), rowCells);
    slots.push(r.slot);
    cursor = r.next;
  }
  const next = { tile: step(cursor, false, rowCells).slot, double: step(cursor, true, rowCells).slot };
  const bottom = Math.max(cursor.y, Math.ceil(next.tile.b.y), Math.ceil(next.double.b.y - 0.5));
  return { id, slots, next, top, bottom };
}

/**
 * Раскладка всего стола. bottom — чьё место внизу экрана: его поезд — нижний.
 */
export function layoutTable(state: GameState, o: { rowCells: number; bottom: Player }): TableLayout {
  const mine = ownTrain(o.bottom);
  const theirs = ownTrain((1 - o.bottom) as Player);
  const trains: TrainLayout[] = [];
  let top = 0;
  for (const id of [theirs, 'mx', mine] as const) {
    const t = layoutTrain(id, state.trains[id].tiles.map((p) => p.tile), top, o.rowCells);
    trains.push(t);
    top = t.bottom + TRAIN_GAP;
  }
  const last = trains[trains.length - 1]!;
  const yc = (trains[0]!.top + last.bottom) / 2;
  let maxX = TRAIN_X + 1;
  for (const t of trains) {
    for (const s of [...t.slots, t.next.tile, t.next.double]) maxX = Math.max(maxX, s.a.x, s.b.x);
  }
  return {
    loco: { a: { x: 0, y: yc - 0.5 }, b: { x: 0, y: yc + 0.5 } },
    trains,
    bounds: { minX: -1.2, maxX: maxX + 1.2, minY: trains[0]!.top - 2, maxY: last.bottom + 1.4 },
  };
}
