// Бот: легальность, детерминизм, честность (не читает скрытое), знание из
// журнала, уровни.
import { describe, expect, it } from 'vitest';
import {
  BASE_VARIANT,
  applyMove,
  chooseBotMove,
  determinize,
  finishRound,
  fullSet,
  hasValue,
  legalMoves,
  moveEquals,
  newRound,
  nextRound,
  startMatch,
  voidValues,
  type BotLevel,
  type GameState,
  type Move,
} from '../src/engine';
import { DRAW, LOCO, PASS, allTiles, makeState, place } from './helpers';

/** Довести раунд до первого настоящего выбора (больше одного легального хода). */
function toChoice(seed: number, skip = 0): GameState {
  let s = newRound({ seed, first: 0, round: 0, variant: BASE_VARIANT });
  let seen = 0;
  for (let guard = 0; guard < 300 && s.phase !== 'over'; guard++) {
    const moves = legalMoves(s);
    if (moves.length > 1 && seen++ >= skip) return s;
    s = applyMove(s, moves[0]!);
  }
  throw new Error('выбор не встретился');
}

/** То же видимое состояние, но рука соперника и базар перетасованы между собой. */
function reshuffleHidden(s: GameState): GameState {
  const me = s.current;
  const opp = (1 - me) as 0 | 1;
  const hidden = [...s.hands[opp], ...s.boneyard].reverse();
  const hand = hidden.slice(0, s.hands[opp].length);
  const boneyard = hidden.slice(s.hands[opp].length);
  return { ...s, hands: me === 0 ? [s.hands[0], hand] : [hand, s.hands[1]], boneyard };
}

describe('бот: общий порядок', () => {
  it('единственный ход возвращается как есть: локомотив, добор, пас', () => {
    expect(chooseBotMove(makeState({ hands: [['6-6'], ['5-1']], phase: 'loco' }))).toEqual(LOCO);
    expect(chooseBotMove(makeState({ hands: [['3-1'], ['4-4']], boneyard: ['2-2'] }))).toEqual(DRAW);
    expect(chooseBotMove(makeState({ hands: [['3-1'], ['4-4']] }))).toEqual(PASS);
  });

  it('раунд окончен — исключение', () => {
    const over = applyMove(makeState({ hands: [['6-3'], ['5-1']] }), place('6-3', 'p0'));
    expect(() => chooseBotMove(over)).toThrow('Раунд окончен');
  });

  it('каждый уровень выбирает легальный ход и детерминирован по seed', () => {
    const s = toChoice(7);
    for (const level of ['easy', 'normal', 'strong'] as BotLevel[]) {
      const a = chooseBotMove(s, { level, seed: 99 });
      const b = chooseBotMove(s, { level, seed: 99 });
      expect(a).toEqual(b);
      expect(legalMoves(s).some((m) => moveEquals(m, a))).toBe(true);
    }
    // Без параметров — уровень normal и seed по умолчанию: тоже воспроизводимо.
    expect(chooseBotMove(s)).toEqual(chooseBotMove(s));
  });

  it('easy играет с разбросом: в одной позиции разные seed дают разные ходы', () => {
    const s = toChoice(7);
    const picks = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const m = chooseBotMove(s, { level: 'easy', seed });
      expect(legalMoves(s).some((x) => moveEquals(x, m))).toBe(true);
      picks.add(JSON.stringify(m));
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('бот: честность', () => {
  it('перетасовка скрытого (рука соперника, базар) не меняет выбор', () => {
    for (const seed of [3, 11, 42]) {
      for (const skip of [0, 2, 5]) {
        const s = toChoice(seed, skip);
        const hidden = reshuffleHidden(s);
        expect(hidden.hands[s.current]).toEqual(s.hands[s.current]);
        for (const level of ['easy', 'normal', 'strong'] as BotLevel[]) {
          expect(chooseBotMove(hidden, { level, seed: 5 })).toEqual(chooseBotMove(s, { level, seed: 5 }));
          expect(chooseBotMove(hidden, { level })).toEqual(chooseBotMove(s, { level }));
        }
      }
    }
  });

  it('расклад сохраняет видимое: свою руку, стол, размеры руки соперника и базара', () => {
    const s = toChoice(21, 3);
    const me = s.current;
    const opp = (1 - me) as 0 | 1;
    const [w, rng] = determinize(s, me, 123);
    expect(rng).not.toBe(123);
    expect(w.hands[me]).toEqual(s.hands[me]);
    expect(w.trains).toEqual(s.trains);
    expect(w.hands[opp]).toHaveLength(s.hands[opp].length);
    expect(w.boneyard).toHaveLength(s.boneyard.length);
    expect(allTiles(w).sort()).toEqual(fullSet().sort());
    // Тот же seed — тот же расклад; за второго игрока расклад тоже строится.
    expect(determinize(s, me, 123)[0]).toEqual(w);
    const [v] = determinize(s, opp, 123);
    expect(v.hands[opp]).toEqual(s.hands[opp]);
    expect(allTiles(v).sort()).toEqual(fullSet().sort());
  });
});

describe('бот: знание из журнала', () => {
  it('до первого добора соперника пустых чисел нет; свои доборы и поиск локомотива не в счёт', () => {
    const s = makeState({ hands: [['6-6', '3-1'], ['5-1']], boneyard: ['4-4', '2-0'], phase: 'loco', current: 1 });
    // Соперник (игрок 1) тянет в поиске локомотива, затем игрок 0 выставляет его.
    let n = applyMove(s, DRAW);
    n = applyMove(n, LOCO);
    expect(voidValues(n, 0)).toEqual([]);
    // Игрок 0 тянет сам (3-1 не подходит к шестёрке) — про соперника это ничего не говорит.
    n = applyMove(n, DRAW);
    expect(voidValues(n, 0)).toEqual([]);
  });

  it('соперник тянул — у него нет костей под свой поезд и мексиканский', () => {
    const s = makeState({
      hands: [['2-1'], ['3-1']],
      boneyard: ['1-0'],
      trains: { p1: { end: 4 }, mx: { end: 5 } },
      current: 1,
    });
    const n = applyMove(s, DRAW);
    expect(voidValues(n, 0)).toEqual([4, 5]);
  });

  it('мой поезд открыт — нет и костей под его конец; закрыт — в расчёт не идёт', () => {
    const hands: [string[], string[]] = [['6-2', '0-0'], ['3-1', '1-1']];
    const open = makeState({
      hands,
      boneyard: ['1-0', '5-5'],
      trains: { p0: { end: 2, open: true }, p1: { end: 4 }, mx: { end: 5 } },
      current: 1,
    });
    expect(voidValues(applyMove(open, DRAW), 0)).toEqual([2, 4, 5]);
    const closed = makeState({
      hands,
      boneyard: ['1-0', '5-5'],
      trains: { p0: { end: 2 }, p1: { end: 4 }, mx: { end: 5 } },
      current: 1,
    });
    expect(voidValues(applyMove(closed, DRAW), 0)).toEqual([4, 5]);
  });

  it('открытый дубль: соперник не закрыл — у него нет костей с этим числом; пас считается так же', () => {
    const s = makeState({
      hands: [['3-3', '6-2'], ['5-4']],
      boneyard: ['1-0', '2-0'],
      trains: { p0: { end: 3 } },
    });
    let n = applyMove(s, place('3-3', 'p0'));
    n = applyMove(n, DRAW); // игрок 0 не закрыл
    n = applyMove(n, DRAW); // соперник не закрыл
    expect(voidValues(n, 0)).toEqual([3]);
    // С точки зрения соперника: игрок 0 тянул под свой же дубль.
    expect(voidValues(n, 1)).toEqual([3]);
    const blocked = makeState({ hands: [['3-3'], ['5-1']], trains: { p0: { end: 3 } } });
    const p = applyMove(applyMove(applyMove(blocked, place('3-3', 'p0')), PASS), PASS);
    expect(voidValues(p, 0)).toEqual([3]);
  });

  it('мёртвый дубль обязанности не создаёт: последующий добор соперника — про обычные концы', () => {
    const table = { mx: { tiles: ['3-0', '3-1', '3-2', '4-3', '5-3'] as const, end: 5 } };
    const s = makeState({
      hands: [['3-3', '6-1'], ['2-2', '1-1']],
      boneyard: ['1-0'],
      trains: { ...table, p0: { tiles: ['6-3'], end: 3 } },
    });
    const n = applyMove(applyMove(s, place('3-3', 'p0')), DRAW);
    // Свой поезд соперника смотрит на 6, мексиканский — на 5.
    expect(voidValues(n, 0)).toEqual([6, 5]);
  });

  it('расклад учитывает пустые числа соперника', () => {
    const s = makeState({
      hands: [['2-1', '6-5'], ['3-1', '0-0']],
      boneyard: ['1-0', '4-4', '6-4'],
      trains: { p1: { end: 4 }, mx: { end: 5 } },
      current: 1,
    });
    const n = applyMove(s, DRAW); // соперник вытянул 1-0: под 4 и 5 у него ничего нет
    expect(n.current).toBe(0);
    for (let seed = 1; seed <= 30; seed++) {
      const [w] = determinize(n, 0, seed);
      expect(w.hands[1].every((t) => !hasValue(t, 4) && !hasValue(t, 5))).toBe(true);
    }
  });

  it('если известных пустых чисел слишком много для руки соперника, расклад строится без них', () => {
    // Рукотворный журнал: «пусто» по шестёрке (конец всех поездов), а невидимых
    // костей без шестёрки меньше, чем рука соперника.
    const s = makeState({
      hands: [['6-5'], ['6-4', '6-3', '6-2', '6-1', '6-0']],
      trains: { mx: { tiles: fullSet().filter((t) => !t.includes('6') && t !== '0-0' && t !== '1-0') } },
    });
    const logged: GameState = { ...s, log: [{ kind: 'loco', player: 0, tile: '6-6' }, { kind: 'pass', player: 1, lacks: [6] }] };
    expect(voidValues(logged, 0)).toEqual([6]);
    const [w] = determinize(logged, 0, 9);
    expect(w.hands[1]).toHaveLength(5);
    expect(allTiles(w).sort()).toEqual(fullSet().sort());
  });
});

describe('бот: сила', () => {
  it('очевидный выход: с единственной подходящей костью бот выходит', () => {
    const s = makeState({ hands: [['6-3'], ['5-1', '2-2']], trains: { p1: { open: true } } });
    for (const level of ['normal', 'strong'] as BotLevel[]) {
      const m = chooseBotMove(s, { level, seed: 1 });
      expect(m.type).toBe('place');
      expect(applyMove(s, m).phase).toBe('over');
    }
  });

  it('strong в среднем набирает меньше очков, чем easy', () => {
    const totals = { strong: 0, easy: 0 };
    for (let game = 0; game < 6; game++) {
      const strongSeat = (game % 2) as 0 | 1;
      let match = startMatch({ names: ['А', 'Б'], first: (game % 2) as 0 | 1, variant: BASE_VARIANT, seed: 300 + game });
      for (let r = 0; r < 7; r++) {
        let s = match.round;
        while (s.phase !== 'over') {
          const level: BotLevel = s.current === strongSeat ? 'strong' : 'easy';
          s = applyMove(s, chooseBotMove(s, { level }));
        }
        match = finishRound({ ...match, round: s });
        if (r < 6) match = nextRound(match, 900 + game * 10 + r);
      }
      totals.strong += match.totals[strongSeat];
      totals.easy += match.totals[(1 - strongSeat) as 0 | 1];
    }
    expect(totals.strong).toBeLessThan(totals.easy);
  }, 120_000);
});
