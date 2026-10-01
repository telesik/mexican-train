// Матч: семь раундов, чередование первого хода, итог по меньшей сумме, ничья.
import { describe, expect, it } from 'vitest';
import {
  BASE_VARIANT,
  ROUNDS,
  finishRound,
  nextRound,
  startMatch,
  type GameState,
  type MatchState,
  type RoundResult,
} from '../src/engine';
import { lcg, playout } from './helpers';

/** Подменить результат текущего раунда: матчу важен только result. */
function withResult(match: MatchState, added: [number, number]): MatchState {
  const result: RoundResult = {
    cause: 'out',
    sums: added,
    added,
    winner: added[0] < added[1] ? 0 : added[1] < added[0] ? 1 : null,
  };
  const round: GameState = { ...match.round, phase: 'over', result };
  return { ...match, round };
}

/** Сыграть матч целиком, подставляя заданные очки каждому раунду. */
function playMatch(perRound: [number, number][]): MatchState {
  let match = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 1 });
  perRound.forEach((added, i) => {
    match = finishRound(withResult(match, added));
    if (i < perRound.length - 1) match = nextRound(match, 100 + i);
  });
  return match;
}

describe('матч', () => {
  it('старт: раунд 0 с локомотивом 6-6 (ещё не выставлен), счёт 0:0, бота нет', () => {
    const m = startMatch({ names: ['А', 'Б'], first: 1, variant: BASE_VARIANT, seed: 5 });
    expect(m.round.round).toBe(0);
    expect(m.round.loco).toBe(6);
    expect(m.round.phase).toBe('loco');
    expect(m.round.first).toBe(1);
    expect(m.round.seed).toBe(5);
    expect(m.totals).toEqual([0, 0]);
    expect(m.rounds).toEqual([]);
    expect(m.outcome).toBeNull();
    expect(m.bot).toBeNull();
  });

  it('seed не задан — берётся криптослучайный; бот запоминается', () => {
    const a = startMatch({
      names: ['А', 'Бот'],
      first: 0,
      variant: BASE_VARIANT,
      bot: { player: 1, level: 'normal' },
    });
    expect(Number.isInteger(a.round.seed)).toBe(true);
    expect(a.bot).toEqual({ player: 1, level: 'normal' });
  });

  it('незавершённый раунд учесть нельзя; учтённый — нельзя учесть дважды', () => {
    const m = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 1 });
    expect(() => finishRound(m)).toThrow('Раунд ещё не завершён');
    const done = finishRound(withResult(m, [0, 9]));
    expect(() => finishRound(done)).toThrow('Раунд уже учтён');
  });

  it('учёт раунда: очки прибавляются, протокол раунда сохраняется', () => {
    const m = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 3 });
    const over = playout(m.round, lcg(11));
    const done = finishRound({ ...m, round: over });
    expect(done.totals).toEqual(over.result!.added);
    expect(done.rounds).toHaveLength(1);
    expect(done.rounds[0]).toMatchObject({ round: 0, first: 0, seed: 3, moves: over.history });
    expect(done.outcome).toBeNull();
  });

  it('следующий раунд: локомотив на единицу меньше, начинает победитель предыдущего', () => {
    const m = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 1 });
    // Раунд начинал игрок 0, выиграл игрок 1 — он и начинает следующий.
    const next = nextRound(finishRound(withResult(m, [9, 0])), 77);
    expect(next.round.round).toBe(1);
    expect(next.round.loco).toBe(5);
    expect(next.first).toBe(1);
    expect(next.round.first).toBe(1);
    expect(next.round.current).toBe(1);
    expect(next.round.seed).toBe(77);
    // Снова выиграл игрок 1 — начинает опять он.
    const third = nextRound(finishRound(withResult(next, [4, 0])));
    expect(third.first).toBe(1);
    expect(third.round.loco).toBe(4);
    expect(Number.isInteger(third.round.seed)).toBe(true);
  });

  it('в раунде поровну — победителя нет, начинать переходит к другому игроку', () => {
    const m = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 1 });
    expect(nextRound(finishRound(withResult(m, [5, 5])), 2).first).toBe(1);
    const m1 = startMatch({ names: ['А', 'Б'], first: 1, variant: BASE_VARIANT, seed: 1 });
    expect(nextRound(finishRound(withResult(m1, [5, 5])), 2).first).toBe(0);
  });

  it('следующий раунд нельзя начать, пока текущий не учтён', () => {
    const m = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 1 });
    expect(() => nextRound(m)).toThrow('Текущий раунд не учтён');
  });

  it('после седьмого раунда побеждает меньшая сумма', () => {
    const m = playMatch([[0, 9], [5, 0], [0, 3], [7, 0], [0, 1], [2, 0], [0, 4]]);
    expect(m.rounds).toHaveLength(ROUNDS);
    expect(m.totals).toEqual([14, 17]);
    expect(m.outcome).toEqual({ kind: 'win', winner: 0 });
    expect(playMatch([[9, 0], [0, 5], [3, 0], [0, 7], [1, 0], [0, 2], [4, 0]]).outcome).toEqual({
      kind: 'win',
      winner: 1,
    });
  });

  it('до седьмого раунда итога нет, сколько бы очков ни набрали', () => {
    const m = playMatch([[0, 90], [0, 90], [0, 90], [0, 90], [0, 90], [0, 90]]);
    expect(m.rounds).toHaveLength(6);
    expect(m.outcome).toBeNull();
  });

  it('равенство сумм — ничья, число выигранных раундов не учитывается', () => {
    // Игрок 0 выиграл шесть раундов из семи, но суммы равны.
    const m = playMatch([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [6, 0]]);
    expect(m.totals).toEqual([6, 6]);
    expect(m.outcome).toEqual({ kind: 'draw' });
  });

  it('после итога матча следующий раунд начать нельзя', () => {
    const m = playMatch([[0, 9], [5, 0], [0, 3], [7, 0], [0, 1], [2, 0], [0, 4]]);
    expect(() => nextRound(m)).toThrow('Матч окончен');
  });
});
