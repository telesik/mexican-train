// Симуляция: случайные партии целиком. Проверяются инварианты движка, а не
// конкретные ходы: раунд всегда кончается, набор костей сохраняется, итог
// согласован с руками, протокол воспроизводится.
import { describe, expect, it } from 'vitest';
import {
  BASE_VARIANT,
  ROUNDS,
  applyMove,
  finishRound,
  fullSet,
  handSum,
  isDouble,
  legalMoves,
  matchProtocol,
  nextRound,
  startMatch,
  validateProtocol,
  type GameState,
} from '../src/engine';
import { allTiles, lcg } from './helpers';

function checkInvariants(s: GameState): void {
  const loco = `${s.loco}-${s.loco}`;
  expect([...allTiles(s), loco].sort()).toEqual(fullSet().sort());
  for (const id of ['p0', 'p1', 'mx'] as const) {
    const train = s.trains[id];
    let end = s.loco;
    for (const p of train.tiles) {
      expect(p.values[0]).toBe(end);
      end = p.values[1];
    }
    expect(train.end).toBe(end);
  }
  expect(s.trains.mx.open).toBe(true);
  if (s.openDouble) {
    const last = s.trains[s.openDouble.train].tiles.at(-1)!;
    expect(isDouble(last.tile)).toBe(true);
    expect(s.trains[s.openDouble.train].end).toBe(s.openDouble.value);
  }
  if (s.mustPlay) expect(s.hands[s.current]).toContain(s.mustPlay);
}

describe('симуляция', () => {
  it('200 матчей случайной политикой: инварианты держатся, матч кончается за 7 раундов', () => {
    const causes = { out: 0, blocked: 0 };
    for (let game = 0; game < 200; game++) {
      const rand = lcg(game + 1);
      let match = startMatch({
        names: ['А', 'Б'],
        first: (game % 2) as 0 | 1,
        variant: BASE_VARIANT,
        seed: 1000 + game,
      });
      for (let r = 0; r < ROUNDS; r++) {
        let state = match.round;
        let guard = 0;
        while (state.phase !== 'over') {
          expect(++guard).toBeLessThan(300);
          const moves = legalMoves(state);
          expect(moves.length).toBeGreaterThan(0);
          state = applyMove(state, moves[Math.floor(rand() * moves.length)]!);
          checkInvariants(state);
        }
        const result = state.result!;
        causes[result.cause]++;
        expect(result.sums).toEqual([handSum(state.hands[0]), handSum(state.hands[1])]);
        if (result.cause === 'out') {
          expect(state.openDouble).toBeNull();
          expect(Math.min(state.hands[0].length, state.hands[1].length)).toBe(0);
        } else {
          expect(state.boneyard).toHaveLength(0);
        }
        match = finishRound({ ...match, round: state });
        if (r < ROUNDS - 1) match = nextRound(match, 5000 + game * 10 + r);
      }
      expect(match.outcome).not.toBeNull();
      expect(validateProtocol(matchProtocol(match))).toEqual({ ok: true });
    }
    // Оба исхода раунда встречаются в выборке.
    expect(causes.out).toBeGreaterThan(0);
    expect(causes.blocked).toBeGreaterThan(0);
  });
});
