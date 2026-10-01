// Раскладка стола: ряды поездов, дубли поперёк, поворот «змейкой».
import { describe, expect, it } from 'vitest';
import { layoutTable, layoutTrain, TRAIN_X } from '../src/ui/layout';
import { makeState } from './helpers';

describe('раскладка поезда', () => {
  it('пустой поезд: следующая кость — у начала ряда, дубль — поперёк', () => {
    const t = layoutTrain('mx', [], 4, 10);
    expect(t.slots).toEqual([]);
    expect(t.next.tile).toEqual({ a: { x: TRAIN_X, y: 4 }, b: { x: TRAIN_X + 1, y: 4 } });
    expect(t.next.double).toEqual({ a: { x: TRAIN_X, y: 3.5 }, b: { x: TRAIN_X, y: 4.5 } });
    expect([t.top, t.bottom]).toEqual([4, 4]);
  });

  it('кости идут вправо вплотную; дубль занимает одну клетку пути', () => {
    const t = layoutTrain('p0', ['6-5', '5-5', '5-2'], 0, 18);
    expect(t.slots).toEqual([
      { a: { x: 2, y: 0 }, b: { x: 3, y: 0 } },
      { a: { x: 4, y: -0.5 }, b: { x: 4, y: 0.5 } },
      { a: { x: 5, y: 0 }, b: { x: 6, y: 0 } },
    ]);
    expect(t.next.tile.a).toEqual({ x: 7, y: 0 });
    expect(t.bottom).toBe(0);
  });

  it('ряд заполнен — кость поворачивает вниз, следующий ряд идёт обратно', () => {
    // Ряд на 4 клетки: две кости, третья — вертикальная связка, четвёртая — влево.
    const t = layoutTrain('p0', ['6-5', '5-4', '4-3', '3-2'], 0, 4);
    expect(t.slots[2]).toEqual({ a: { x: 5, y: 1 }, b: { x: 5, y: 2 } });
    expect(t.slots[3]).toEqual({ a: { x: 4, y: 2 }, b: { x: 3, y: 2 } });
    // Во втором ряду клетка связки и кость — следующей кости места уже нет: снова поворот.
    expect(t.next.tile).toEqual({ a: { x: 3, y: 3 }, b: { x: 3, y: 4 } });
    expect(t.bottom).toBe(4);
    // Дублю хватает оставшейся клетки ряда.
    expect(t.next.double).toEqual({ a: { x: 2, y: 1.5 }, b: { x: 2, y: 2.5 } });
  });

  it('дубль на повороте ложится поперёк связки, следующая кость — под ним', () => {
    const t = layoutTrain('p0', ['6-5', '5-4', '4-4', '4-1'], 0, 4);
    expect(t.slots[2]).toEqual({ a: { x: 4.5, y: 1 }, b: { x: 5.5, y: 1 } });
    expect(t.slots[3]).toEqual({ a: { x: 5, y: 2 }, b: { x: 4, y: 2 } });
  });

  it('сразу за дублем поворота нет: ряд на клетку длиннее', () => {
    // Ряд на 3 клетки: кость (2), дубль (1), следующая кость идёт прямо.
    const t = layoutTrain('p0', ['6-5', '5-5', '5-1', '1-0'], 0, 3);
    expect(t.slots[2]).toEqual({ a: { x: 5, y: 0 }, b: { x: 6, y: 0 } });
    // А вот за ней — поворот.
    expect(t.slots[3]).toEqual({ a: { x: 6, y: 1 }, b: { x: 6, y: 2 } });
  });

  it('место следующей кости на повороте резервирует ряд заранее', () => {
    const t = layoutTrain('p0', ['6-5', '5-4'], 0, 4);
    expect(t.next.tile).toEqual({ a: { x: 5, y: 1 }, b: { x: 5, y: 2 } });
    expect(t.next.double).toEqual({ a: { x: 4.5, y: 1 }, b: { x: 5.5, y: 1 } });
    expect(t.bottom).toBe(2);
  });
});

describe('раскладка стола', () => {
  const state = makeState({
    hands: [['1-0'], ['2-0']],
    trains: { p0: { tiles: ['6-5'], end: 5 }, p1: { tiles: ['6-4', '4-4'], end: 4 }, mx: { end: 6 } },
  });

  it('поезда сверху вниз: соперника, мексиканский, свой; локомотив — слева по центру', () => {
    const l = layoutTable(state, { rowCells: 18, bottom: 0 });
    expect(l.trains.map((t) => t.id)).toEqual(['p1', 'mx', 'p0']);
    expect(l.trains.map((t) => t.top)).toEqual([0, 3, 6]);
    expect(l.loco).toEqual({ a: { x: 0, y: 2.5 }, b: { x: 0, y: 3.5 } });
    const flipped = layoutTable(state, { rowCells: 18, bottom: 1 });
    expect(flipped.trains.map((t) => t.id)).toEqual(['p0', 'mx', 'p1']);
  });

  it('границы охватывают локомотив, подписи, кости и места следующих костей', () => {
    const l = layoutTable(state, { rowCells: 18, bottom: 0 });
    expect(l.bounds.minX).toBeLessThan(0);
    expect(l.bounds.minY).toBe(-2);
    expect(l.bounds.maxY).toBeCloseTo(7.4, 6);
    // Самая правая клетка — место следующей кости поезда p1 (после кости и дубля).
    expect(l.bounds.maxX).toBeCloseTo(6 + 1.2, 6);
  });

  it('поезд, ушедший на второй ряд, отодвигает нижние', () => {
    const long = makeState({
      hands: [[], []],
      trains: { p1: { tiles: ['6-5', '5-4', '4-3'], end: 3 } },
    });
    const l = layoutTable(long, { rowCells: 4, bottom: 0 });
    expect(l.trains[0]!.bottom).toBe(2);
    expect(l.trains[1]!.top).toBe(5);
  });
});
