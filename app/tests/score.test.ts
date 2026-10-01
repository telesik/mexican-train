// Счёт раунда: сумма очков на руке, одинокая 0-0, победитель раунда.
import { describe, expect, it } from 'vitest';
import { LONE_BLANK_PENALTY, handSum, scoreRound } from '../src/engine';

describe('счёт', () => {
  it('сумма очков на руке; пустая рука — 0', () => {
    expect(handSum([])).toBe(0);
    expect(handSum(['6-5', '2-1'])).toBe(14);
  });

  it('одинокая 0-0 — штраф 25', () => {
    expect(LONE_BLANK_PENALTY).toBe(25);
    expect(handSum(['0-0'])).toBe(25);
  });

  it('0-0 в компании других костей стоит 0', () => {
    expect(handSum(['0-0', '3-1'])).toBe(4);
    expect(handSum(['0-0', '1-0'])).toBe(1);
  });

  it('каждый получает свою сумму; победитель раунда — у кого меньше', () => {
    expect(scoreRound([[], ['6-6']], 'out')).toEqual({
      cause: 'out',
      sums: [0, 12],
      added: [0, 12],
      winner: 0,
    });
    expect(scoreRound([['5-5'], ['2-1']], 'blocked')).toEqual({
      cause: 'blocked',
      sums: [10, 3],
      added: [10, 3],
      winner: 1,
    });
  });

  it('поровну — победителя раунда нет', () => {
    expect(scoreRound([['4-1'], ['3-2']], 'blocked').winner).toBeNull();
  });

  it('соперник вышел, а на руке одинокая 0-0 — 25', () => {
    expect(scoreRound([[], ['0-0']], 'out')).toEqual({
      cause: 'out',
      sums: [0, 25],
      added: [0, 25],
      winner: 0,
    });
  });
});
