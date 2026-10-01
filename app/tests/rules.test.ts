// Правила раунда: раздача, легальные ходы, добор, открытые поезда, дубли,
// конец раунда. Каждый тест — один пункт правил.
import { describe, expect, it } from 'vitest';
import {
  BASE_VARIANT,
  allowedTrains,
  applyMove,
  fullSet,
  isTrainDead,
  legalMoves,
  locoOf,
  locoTile,
  moveEquals,
  newRound,
  ownTrain,
  otherPlayer,
  trainsForTile,
  valueExhausted,
} from '../src/engine';
import { DRAW, LOCO, PASS, allTiles, makeState, place } from './helpers';

describe('раздача', () => {
  it('локомотив раунда: 6-6 в первом, 0-0 в седьмом', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(locoOf)).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });

  it('нет такого раунда — исключение', () => {
    expect(() => locoOf(7)).toThrow('Нет такого раунда');
    expect(() => locoOf(-1)).toThrow('Нет такого раунда');
    expect(() => locoOf(1.5)).toThrow('Нет такого раунда');
  });

  it('по 7 костей на руку, 14 в базаре, дубль раунда участвует в раздаче', () => {
    for (let round = 0; round < 7; round++) {
      const s = newRound({ seed: 100 + round, first: 0, round, variant: BASE_VARIANT });
      expect(s.loco).toBe(6 - round);
      expect(locoTile(s.loco)).toBe(`${6 - round}-${6 - round}`);
      expect(s.hands[0]).toHaveLength(7);
      expect(s.hands[1]).toHaveLength(7);
      expect(s.boneyard).toHaveLength(14);
      expect(allTiles(s)).toContain(locoTile(s.loco));
      expect(allTiles(s).sort()).toEqual(fullSet().sort());
    }
  });

  it('стартовое состояние: локомотив не выставлен, поезда пусты, личные закрыты, мексиканский открыт', () => {
    const s = newRound({ seed: 7, first: 1, round: 2, variant: BASE_VARIANT });
    expect(s.phase).toBe('loco');
    expect(s.current).toBe(1);
    expect(s.first).toBe(1);
    expect(s.trains.p0).toEqual({ tiles: [], end: 4, open: false });
    expect(s.trains.p1).toEqual({ tiles: [], end: 4, open: false });
    expect(s.trains.mx).toEqual({ tiles: [], end: 4, open: true });
    expect(s.history).toEqual([]);
    expect(s.result).toBeNull();
  });

  it('раздача детерминирована по seed; первые семь костей — первому игроку', () => {
    const a = newRound({ seed: 42, first: 0, round: 0, variant: BASE_VARIANT });
    const b = newRound({ seed: 42, first: 0, round: 0, variant: BASE_VARIANT });
    const c = newRound({ seed: 42, first: 1, round: 0, variant: BASE_VARIANT });
    expect(a).toEqual(b);
    expect(c.hands[1]).toEqual(a.hands[0]);
    expect(c.hands[0]).toEqual(a.hands[1]);
    expect(c.boneyard).toEqual(a.boneyard);
    expect(newRound({ seed: 43, first: 0, round: 0, variant: BASE_VARIANT }).hands).not.toEqual(a.hands);
  });

  it('ownTrain и otherPlayer', () => {
    expect(ownTrain(0)).toBe('p0');
    expect(ownTrain(1)).toBe('p1');
    expect(otherPlayer(0)).toBe(1);
    expect(otherPlayer(1)).toBe(0);
  });
});

describe('локомотив раунда', () => {
  it('дубль раунда на руке — игрок выставляет его и делает первый ход', () => {
    const s = makeState({ hands: [['6-6', '6-3', '2-1'], ['5-1']], boneyard: ['4-4'], phase: 'loco' });
    expect(legalMoves(s)).toEqual([LOCO]);
    const n = applyMove(s, { type: 'loco', t: 700 });
    expect(n.phase).toBe('main');
    expect(n.hands[0]).toEqual(['6-3', '2-1']);
    expect(n.current).toBe(0);
    expect(n.history).toEqual([{ type: 'loco', t: 700 }]);
    expect(n.log).toEqual([{ kind: 'loco', player: 0, tile: '6-6' }]);
    expect(legalMoves(n)).toEqual([place('6-3', 'p0'), place('6-3', 'mx')]);
  });

  it('второй игрок выставляет локомотив: рука первого не меняется', () => {
    const s = makeState({ hands: [['2-1'], ['6-6', '5-1']], phase: 'loco', current: 1 });
    const n = applyMove(s, LOCO);
    expect(n.hands).toEqual([['2-1'], ['5-1']]);
    expect(n.current).toBe(1);
  });

  it('нужного дубля нет — только добор; вытянул не тот — кость на руке, ход сопернику, поезд не открывается', () => {
    const s = makeState({ hands: [['6-3'], ['5-1']], boneyard: ['4-4', '6-6'], phase: 'loco' });
    expect(legalMoves(s)).toEqual([DRAW]);
    const n = applyMove(s, DRAW);
    expect(n.phase).toBe('loco');
    expect(n.hands[0]).toEqual(['6-3', '4-4']);
    expect(n.boneyard).toEqual(['6-6']);
    expect(n.current).toBe(1);
    expect(n.trains.p0.open).toBe(false);
    expect(n.mustPlay).toBeNull();
    expect(n.log).toEqual([{ kind: 'draw', player: 0, tile: '4-4', playable: false, lacks: [] }]);
  });

  it('вытянул нужный дубль — остаётся при ходе и выставляет его', () => {
    const s = makeState({ hands: [['6-3'], ['5-1']], boneyard: ['6-6', '4-4'], phase: 'loco' });
    const n = applyMove(s, DRAW);
    expect(n.current).toBe(0);
    expect(n.log).toEqual([{ kind: 'draw', player: 0, tile: '6-6', playable: true, lacks: [] }]);
    expect(legalMoves(n)).toEqual([LOCO]);
    expect(applyMove(n, LOCO).phase).toBe('main');
  });

  it('по кругу, пока дубль не найдётся: тянут по очереди', () => {
    const s = makeState({
      hands: [['6-3'], ['5-1']],
      boneyard: ['4-4', '2-0', '1-1', '6-6'],
      phase: 'loco',
    });
    let n = applyMove(s, DRAW); // игрок 0: 4-4
    n = applyMove(n, DRAW); // игрок 1: 2-0
    n = applyMove(n, DRAW); // игрок 0: 1-1
    expect(n.current).toBe(1);
    n = applyMove(n, DRAW); // игрок 1: 6-6
    expect(n.current).toBe(1);
    n = applyMove(n, LOCO);
    expect(n.phase).toBe('main');
    expect(n.current).toBe(1);
    expect(n.hands).toEqual([['6-3', '4-4', '1-1'], ['5-1', '2-0']]);
  });

  it('пока локомотив не выставлен, класть кости и пасовать нельзя; в игре выставлять локомотив нельзя', () => {
    const s = makeState({ hands: [['6-6', '6-3'], ['5-1']], phase: 'loco' });
    expect(() => applyMove(s, place('6-3', 'p0'))).toThrow('Нелегальный ход');
    expect(() => applyMove(s, PASS)).toThrow('Нелегальный ход');
    expect(() => applyMove(s, DRAW)).toThrow('Нелегальный ход');
    const main = makeState({ hands: [['6-3'], ['5-1']] });
    expect(() => applyMove(main, LOCO)).toThrow('Нелегальный ход');
  });

  it('раунд после раздачи: локомотив всегда находится, игра начинается', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let s = newRound({ seed, first: (seed % 2) as 0 | 1, round: seed % 7, variant: BASE_VARIANT });
      let guard = 0;
      while (s.phase === 'loco') {
        expect(++guard).toBeLessThan(20);
        s = applyMove(s, legalMoves(s)[0]!);
      }
      expect(s.phase).toBe('main');
      expect(allTiles(s).sort()).toEqual(fullSet().sort());
      // Первый ход — у выставившего локомотив.
      expect(s.log.at(-1)).toMatchObject({ kind: 'loco', player: s.current });
    }
  });
});

describe('легальные ходы', () => {
  it('свой поезд и мексиканский доступны, закрытый поезд соперника — нет', () => {
    const s = makeState({ hands: [['6-3'], ['5-1']] });
    expect(allowedTrains(s)).toEqual(['p0', 'mx']);
    expect(legalMoves(s)).toEqual([place('6-3', 'p0'), place('6-3', 'mx')]);
  });

  it('открытый поезд соперника доступен', () => {
    const s = makeState({ hands: [['6-3'], ['5-1']], trains: { p1: { open: true } } });
    expect(allowedTrains(s)).toEqual(['p0', 'p1', 'mx']);
    expect(trainsForTile(s, '6-3')).toEqual(['p0', 'p1', 'mx']);
  });

  it('кость кладётся только к совпадающему концу', () => {
    const s = makeState({
      hands: [['3-1', '5-2'], ['4-4']],
      trains: { p0: { end: 3 }, mx: { end: 5 } },
    });
    expect(legalMoves(s)).toEqual([place('3-1', 'p0'), place('5-2', 'mx')]);
  });

  it('ходить нечем и базар не пуст — только добор', () => {
    const s = makeState({ hands: [['3-1'], ['4-4']], boneyard: ['2-2'] });
    expect(legalMoves(s)).toEqual([DRAW]);
  });

  it('ходить нечем и базар пуст — только пас', () => {
    const s = makeState({ hands: [['3-1'], ['4-4']] });
    expect(legalMoves(s)).toEqual([PASS]);
  });

  it('есть выкладка — добор и пас недоступны', () => {
    const s = makeState({ hands: [['6-1'], ['4-4']], boneyard: ['2-2'] });
    expect(() => applyMove(s, DRAW)).toThrow('Нелегальный ход');
    expect(() => applyMove(s, PASS)).toThrow('Нелегальный ход');
  });

  it('moveEquals: время обдумывания не сравнивается, тип и место — да', () => {
    expect(moveEquals({ type: 'place', tile: '6-1', train: 'p0', t: 900 }, place('6-1', 'p0'))).toBe(true);
    expect(moveEquals(place('6-1', 'p0'), place('6-1', 'mx'))).toBe(false);
    expect(moveEquals(place('6-1', 'p0'), place('6-2', 'p0'))).toBe(false);
    expect(moveEquals({ type: 'draw', t: 5 }, DRAW)).toBe(true);
    expect(moveEquals(DRAW, PASS)).toBe(false);
    expect(moveEquals(place('6-1', 'p0'), DRAW)).toBe(false);
    expect(moveEquals({ type: 'loco', t: 3 }, LOCO)).toBe(true);
    expect(moveEquals(LOCO, DRAW)).toBe(false);
  });
});

describe('выкладка', () => {
  it('кость уходит с руки, конец поезда меняется, ход переходит, протокол растёт', () => {
    const s = makeState({ hands: [['6-3', '2-1'], ['5-1']] });
    const n = applyMove(s, { type: 'place', tile: '6-3', train: 'p0', t: 1200 });
    expect(n.hands[0]).toEqual(['2-1']);
    expect(n.trains.p0.end).toBe(3);
    expect(n.trains.p0.tiles).toEqual([{ tile: '6-3', values: [6, 3], by: 0, seq: 0 }]);
    expect(n.seq).toBe(1);
    expect(n.current).toBe(1);
    expect(n.history).toEqual([{ type: 'place', tile: '6-3', train: 'p0', t: 1200 }]);
    expect(n.log).toEqual([{ kind: 'place', player: 0, tile: '6-3', train: 'p0', covers: false }]);
  });

  it('второй игрок кладёт на свой поезд: рука первого не меняется', () => {
    const s = makeState({ hands: [['2-1'], ['6-5', '1-1']], current: 1 });
    const n = applyMove(s, place('6-5', 'p1'));
    expect(n.hands).toEqual([['2-1'], ['1-1']]);
    expect(n.trains.p1.end).toBe(5);
    expect(n.current).toBe(0);
  });

  it('мексиканский поезд начинает любой игрок костью с числом локомотива', () => {
    const s = makeState({ hands: [['6-2', '3-3'], ['5-1']] });
    const n = applyMove(s, place('6-2', 'mx'));
    expect(n.trains.mx.end).toBe(2);
    expect(n.trains.mx.open).toBe(true);
    expect(n.trains.p0.tiles).toEqual([]);
  });

  it('нелегальный ход и ход после конца раунда — исключения', () => {
    const s = makeState({ hands: [['6-3'], ['5-1']] });
    expect(() => applyMove(s, place('6-3', 'p1'))).toThrow('Нелегальный ход');
    expect(() => applyMove(s, place('5-1', 'p0'))).toThrow('Нелегальный ход');
    const over = applyMove(s, place('6-3', 'p0'));
    expect(over.phase).toBe('over');
    expect(legalMoves(over)).toEqual([]);
    expect(() => applyMove(over, PASS)).toThrow('Раунд окончен');
  });
});

describe('добор и открытые поезда', () => {
  it('вытянутая кость подошла — ею обязаны сходить, ход не переходит', () => {
    const s = makeState({ hands: [['3-1'], ['4-4']], boneyard: ['6-5', '2-2'] });
    const n = applyMove(s, DRAW);
    expect(n.hands[0]).toEqual(['3-1', '6-5']);
    expect(n.boneyard).toEqual(['2-2']);
    expect(n.mustPlay).toBe('6-5');
    expect(n.current).toBe(0);
    expect(n.trains.p0.open).toBe(false);
    expect(legalMoves(n)).toEqual([place('6-5', 'p0'), place('6-5', 'mx')]);
    expect(n.log).toEqual([{ kind: 'draw', player: 0, tile: '6-5', playable: true, lacks: [6] }]);
    const m = applyMove(n, place('6-5', 'mx'));
    expect(m.mustPlay).toBeNull();
    expect(m.current).toBe(1);
  });

  it('вытянутой костью обязаны сходить, даже если после добора подходит другая', () => {
    // 5-1 раньше не подходила никуда; после добора 6-5 на руке две кости,
    // но ходить можно только вытянутой.
    const s = makeState({ hands: [['5-1'], ['4-4']], boneyard: ['6-5'] });
    const n = applyMove(s, DRAW);
    expect(legalMoves(n).every((m) => m.type === 'place' && m.tile === '6-5')).toBe(true);
  });

  it('вытянутая кость не подошла — остаётся на руке, свой поезд открывается, ход переходит', () => {
    const s = makeState({ hands: [['3-1'], ['4-4']], boneyard: ['2-2'] });
    const n = applyMove(s, DRAW);
    expect(n.hands[0]).toEqual(['3-1', '2-2']);
    expect(n.mustPlay).toBeNull();
    expect(n.trains.p0.open).toBe(true);
    expect(n.current).toBe(1);
    expect(n.log).toEqual([
      { kind: 'draw', player: 0, tile: '2-2', playable: false, lacks: [6] },
      { kind: 'open', train: 'p0' },
    ]);
  });

  it('пас при пустом базаре открывает свой поезд; уже открытый остаётся открытым без записи', () => {
    const s = makeState({ hands: [['3-1'], ['6-4']], trains: { p0: { open: true } } });
    const n = applyMove(s, PASS);
    expect(n.trains.p0.open).toBe(true);
    expect(n.current).toBe(1);
    expect(n.passStreak).toBe(1);
    expect(n.log).toEqual([{ kind: 'pass', player: 0, lacks: [6] }]);
  });

  it('соперник играет на открытый поезд — поезд остаётся открытым', () => {
    const s = makeState({
      hands: [['3-1'], ['6-4', '1-1']],
      trains: { p0: { open: true } },
      current: 1,
    });
    const n = applyMove(s, place('6-4', 'p0'));
    expect(n.trains.p0.open).toBe(true);
    expect(n.trains.p0.end).toBe(4);
  });

  it('владелец сыграл на свой открытый поезд — поезд закрывается', () => {
    const s = makeState({ hands: [['6-1', '2-2'], ['5-4']], trains: { p0: { open: true } } });
    const n = applyMove(s, place('6-1', 'p0'));
    expect(n.trains.p0.open).toBe(false);
    expect(n.log).toEqual([
      { kind: 'place', player: 0, tile: '6-1', train: 'p0', covers: false },
      { kind: 'close', train: 'p0' },
    ]);
  });

  it('владелец сыграл на мексиканский — свой открытый поезд остаётся открытым', () => {
    const s = makeState({ hands: [['6-1', '2-2'], ['5-4']], trains: { p0: { open: true } } });
    const n = applyMove(s, place('6-1', 'mx'));
    expect(n.trains.p0.open).toBe(true);
  });
});

describe('дубли', () => {
  it('после дубля ходит тот же игрок и только на этот дубль', () => {
    const s = makeState({
      hands: [['3-3', '3-1', '6-2'], ['5-4']],
      trains: { p0: { end: 3 } },
    });
    const n = applyMove(s, place('3-3', 'p0'));
    expect(n.current).toBe(0);
    expect(n.openDouble).toEqual({ train: 'p0', value: 3, by: 0 });
    expect(n.trains.p0.tiles[0]!.values).toEqual([3, 3]);
    // 6-2 подошла бы к мексиканскому, но пока дубль открыт — только на него.
    expect(legalMoves(n)).toEqual([place('3-1', 'p0')]);
    const m = applyMove(n, place('3-1', 'p0'));
    expect(m.openDouble).toBeNull();
    expect(m.current).toBe(1);
    expect(m.log.at(-1)).toEqual({ kind: 'place', player: 0, tile: '3-1', train: 'p0', covers: true });
  });

  it('закрыть нечем — добор; вытянутая закрывает — ею и ходят', () => {
    const s = makeState({
      hands: [['3-3', '6-2'], ['5-4']],
      boneyard: ['3-0'],
      trains: { mx: { end: 3 } },
    });
    const d = applyMove(s, place('3-3', 'mx'));
    expect(legalMoves(d)).toEqual([DRAW]);
    const n = applyMove(d, DRAW);
    expect(n.mustPlay).toBe('3-0');
    expect(legalMoves(n)).toEqual([place('3-0', 'mx')]);
  });

  it('не закрыл — свой поезд открывается, закрыть обязан соперник и только этот дубль', () => {
    const s = makeState({
      hands: [['3-3', '6-2'], ['3-5', '6-4']],
      boneyard: ['1-0'],
      trains: { p0: { end: 3 } },
    });
    const d = applyMove(applyMove(s, place('3-3', 'p0')), DRAW);
    expect(d.current).toBe(1);
    expect(d.trains.p0.open).toBe(true);
    expect(d.openDouble).toEqual({ train: 'p0', value: 3, by: 0 });
    // 6-4 подходит к своему поезду и к мексиканскому, но играть можно только на дубль.
    expect(legalMoves(d)).toEqual([place('3-5', 'p0')]);
    const n = applyMove(d, place('3-5', 'p0'));
    expect(n.openDouble).toBeNull();
    expect(n.current).toBe(0);
    // Закрывал соперник — поезд владельца остаётся открытым.
    expect(n.trains.p0.open).toBe(true);
  });

  it('дубль на закрытом личном поезде: соперник обязан закрыть его и там', () => {
    // Владелец выложил дубль на свой закрытый поезд и не закрыл при пустом базаре.
    const s = makeState({
      hands: [['3-3', '6-2'], ['3-5']],
      trains: { p0: { end: 3 } },
    });
    const d = applyMove(applyMove(s, place('3-3', 'p0')), PASS);
    expect(d.current).toBe(1);
    expect(allowedTrains(d)).toEqual(['p0']);
    expect(legalMoves(d)).toEqual([place('3-5', 'p0')]);
  });

  it('оба не закрыли — обязанность возвращается первому', () => {
    const s = makeState({
      hands: [['3-3', '6-2'], ['5-4']],
      boneyard: ['1-0', '2-0', '3-6'],
      trains: { p0: { end: 3 } },
    });
    let n = applyMove(s, place('3-3', 'p0'));
    n = applyMove(n, DRAW); // игрок 0 вытянул 1-0 — не закрывает
    n = applyMove(n, DRAW); // игрок 1 вытянул 2-0 — не закрывает
    expect(n.current).toBe(0);
    expect(n.trains.p1.open).toBe(true);
    n = applyMove(n, DRAW); // игрок 0 вытянул 3-6 — закрывает
    expect(n.mustPlay).toBe('3-6');
    n = applyMove(n, place('3-6', 'p0'));
    // Владелец сыграл на свой поезд — он закрылся.
    expect(n.trains.p0.open).toBe(false);
    expect(n.openDouble).toBeNull();
  });
});

describe('мёртвый дубль', () => {
  // Пять костей с тройкой лежат на мексиканском поезде, шестая (3-6) — на
  // своём: к дублю 3-3 приставить больше нечего.
  const table = { mx: { tiles: ['3-0', '3-1', '3-2', '4-3', '5-3'] as const, end: 5 } };

  it('к дублю приставить нечего — он обычная кость: ход переходит, поезд не открывается', () => {
    const s = makeState({
      hands: [['3-3', '6-1'], ['5-4', '2-2']],
      boneyard: ['1-0'],
      trains: { ...table, p0: { tiles: ['6-3'], end: 3 } },
    });
    const n = applyMove(s, place('3-3', 'p0'));
    expect(n.openDouble).toBeNull();
    expect(n.current).toBe(1);
    expect(n.trains.p0.open).toBe(false);
    expect(n.boneyard).toEqual(['1-0']);
    // Кость помечена: стол кладёт её рубашкой вверх поперёк.
    expect(n.trains.p0.tiles.at(-1)).toEqual({ tile: '3-3', values: [3, 3], by: 0, seq: 0, dead: true });
    expect(n.trains.p0.tiles[0]!.dead).toBeUndefined();
    expect(n.log).toEqual([
      { kind: 'place', player: 0, tile: '3-3', train: 'p0', covers: false },
      { kind: 'dead', train: 'p0' },
    ]);
    // Соперник играет свободно: обязанности закрывать нет.
    expect(legalMoves(n)).toEqual([place('5-4', 'mx')]);
  });

  it('поезд с мёртвым дублем закончен: владельцу остаются мексиканский и открытый поезд соперника', () => {
    const s = makeState({
      hands: [['3-3', '5-1', '6-4'], ['5-4', '2-2']],
      trains: { ...table, p0: { tiles: ['6-3'], end: 3 }, p1: { open: true } },
    });
    const n = applyMove(applyMove(s, place('3-3', 'p0')), place('5-4', 'mx'));
    expect(isTrainDead(n, 'p0')).toBe(true);
    expect(isTrainDead(n, 'p1')).toBe(false);
    expect(n.current).toBe(0);
    expect(legalMoves(n)).toEqual([place('6-4', 'p1'), place('6-4', 'mx')]);
  });

  it('мёртвый дубль последней костью заканчивает раунд сразу', () => {
    const s = makeState({
      hands: [['3-3'], ['5-4']],
      trains: { ...table, p0: { tiles: ['6-3'], end: 3 } },
    });
    const n = applyMove(s, place('3-3', 'p0'));
    expect(n.phase).toBe('over');
    expect(n.result).toEqual({ cause: 'out', sums: [0, 9], added: [0, 9], winner: 0 });
  });

  it('хотя бы одна кость с этим числом не на столе — дубль обычный, закрывать обязаны', () => {
    // 3-6 не на столе: она на руке у соперника.
    const s = makeState({
      hands: [['3-3', '6-1'], ['6-3']],
      boneyard: ['1-0'],
      trains: { ...table, p0: { end: 3 } },
    });
    const n = applyMove(s, place('3-3', 'p0'));
    expect(n.openDouble).toEqual({ train: 'p0', value: 3, by: 0 });
    expect(n.current).toBe(0);
    expect(n.trains.p0.tiles.at(-1)!.dead).toBeUndefined();
    expect(legalMoves(n)).toEqual([DRAW]);
  });

  it('число локомотива: выставленный локомотив считается костью на столе', () => {
    // Все шесть костей с шестёркой, кроме самого 6-6, лежат в поездах.
    const trains = { mx: { tiles: ['6-0', '6-1', '6-2', '6-3', '6-4', '6-5'] as const, end: 5 } };
    const main = makeState({ hands: [['5-1'], ['4-4']], trains });
    expect(valueExhausted(main, 6)).toBe(true);
    // Пустые личные поезда смотрят на локомотив — начать их уже нечем.
    expect(isTrainDead(main, 'p0')).toBe(true);
    expect(isTrainDead(main, 'mx')).toBe(false);
    // Пока локомотив не выставлен, 6-6 ещё не на столе.
    const loco = makeState({ hands: [['6-6'], ['4-4']], trains, phase: 'loco' });
    expect(valueExhausted(loco, 6)).toBe(false);
    expect(valueExhausted(main, 5)).toBe(false);
  });
});

describe('конец раунда', () => {
  it('последняя кость выложена — раунд окончен, вышедший получает 0', () => {
    const s = makeState({ hands: [['6-3'], ['5-1', '2-2']] });
    const n = applyMove(s, place('6-3', 'p0'));
    expect(n.phase).toBe('over');
    expect(n.result).toEqual({ cause: 'out', sums: [0, 10], added: [0, 10], winner: 0 });
    expect(n.log.at(-1)).toEqual({ kind: 'end', cause: 'out' });
  });

  it('дубль последней костью раунд не кончает: надо тянуть и закрывать', () => {
    const s = makeState({
      hands: [['3-3'], ['5-1']],
      boneyard: ['3-2'],
      trains: { p0: { end: 3 } },
    });
    const d = applyMove(s, place('3-3', 'p0'));
    expect(d.phase).toBe('main');
    expect(d.hands[0]).toEqual([]);
    expect(legalMoves(d)).toEqual([DRAW]);
    // Вытянутая закрывает — ею ходят, рука снова пуста, раунд окончен.
    const n = applyMove(applyMove(d, DRAW), place('3-2', 'p0'));
    expect(n.phase).toBe('over');
    expect(n.result).toEqual({ cause: 'out', sums: [0, 6], added: [0, 6], winner: 0 });
  });

  it('дубль последней костью, вытянутая не закрывает — кость на руке, раунд продолжается', () => {
    const s = makeState({
      hands: [['3-3'], ['5-1']],
      boneyard: ['2-0'],
      trains: { p0: { end: 3 } },
    });
    const n = applyMove(applyMove(s, place('3-3', 'p0')), DRAW);
    expect(n.phase).toBe('main');
    expect(n.hands[0]).toEqual(['2-0']);
    expect(n.trains.p0.open).toBe(true);
    expect(n.current).toBe(1);
  });

  it('дубль последней костью при пустом базаре: соперник закрыл — выходит выложивший дубль', () => {
    const s = makeState({
      hands: [['3-3'], ['3-1', '6-6']],
      trains: { p0: { end: 3 } },
    });
    const d = applyMove(applyMove(s, place('3-3', 'p0')), PASS);
    expect(d.phase).toBe('main');
    expect(d.current).toBe(1);
    const n = applyMove(d, place('3-1', 'p0'));
    expect(n.phase).toBe('over');
    expect(n.result).toEqual({ cause: 'out', sums: [0, 12], added: [0, 12], winner: 0 });
  });

  it('базар пуст и подряд спасовали оба — игра заблокирована, каждый получает свою руку', () => {
    const s = makeState({ hands: [['3-1'], ['4-4', '2-0']] });
    const a = applyMove(s, PASS);
    expect(a.phase).toBe('main');
    const b = applyMove(a, PASS);
    expect(b.phase).toBe('over');
    expect(b.result).toEqual({ cause: 'blocked', sums: [4, 10], added: [4, 10], winner: 0 });
    expect(b.log.at(-1)).toEqual({ kind: 'end', cause: 'blocked' });
    expect(b.trains.p0.open).toBe(true);
    expect(b.trains.p1.open).toBe(true);
  });

  it('открытый дубль и пустой базар: никто не закрыл — блокировка', () => {
    const s = makeState({
      hands: [['3-3'], ['5-1']],
      trains: { p0: { end: 3 } },
    });
    const n = applyMove(applyMove(applyMove(s, place('3-3', 'p0')), PASS), PASS);
    expect(n.phase).toBe('over');
    expect(n.result).toEqual({ cause: 'blocked', sums: [0, 6], added: [0, 6], winner: 0 });
  });

  it('выкладка между пасами сбрасывает счётчик блокировки', () => {
    const s = makeState({ hands: [['3-1'], ['6-4', '2-0']] });
    const a = applyMove(s, PASS);
    const b = applyMove(a, place('6-4', 'p1'));
    expect(b.passStreak).toBe(0);
    const c = applyMove(b, PASS);
    expect(c.phase).toBe('main');
    expect(c.passStreak).toBe(1);
  });
});
