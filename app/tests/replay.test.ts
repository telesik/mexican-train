// Протокол: раунд воспроизводится по (seed, first, номер раунда, variant) и ходам.
import { describe, expect, it } from 'vitest';
import {
  BASE_VARIANT,
  finishRound,
  matchProtocol,
  nextRound,
  replayRound,
  startMatch,
  validateProtocol,
  type MatchProtocol,
} from '../src/engine';
import { DRAW, lcg, playout } from './helpers';

function twoRounds() {
  const rand = lcg(2026);
  let match = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 11 });
  match = finishRound({ ...match, round: playout(match.round, rand) });
  match = nextRound(match, 12);
  const first = match.round;
  match = { ...match, round: playout(match.round, rand, 5) };
  return { match, secondStart: first };
}

describe('протокол', () => {
  it('протокол матча: учтённые раунды с итогом и текущий без итога', () => {
    const { match } = twoRounds();
    const p = matchProtocol(match);
    expect(p.format).toBe('mexican-train-protocol');
    expect(p.v).toBe(1);
    expect(p.names).toEqual(['А', 'Б']);
    expect(p.totals).toEqual(match.totals);
    expect(p.rounds).toHaveLength(2);
    expect(p.rounds[0]).toMatchObject({ seed: 11, first: 0 });
    expect(p.rounds[0]!.result).toBeDefined();
    // Второй раунд начинает победитель первого (при равенстве — другой игрок).
    expect(p.rounds[1]).toEqual({ seed: 12, first: match.first, moves: match.round.history });
    expect(match.first).toBe(match.rounds[0]!.winner ?? 1);
  });

  it('учтённый, но ещё не сменённый раунд в протокол дважды не попадает', () => {
    let match = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 11 });
    match = finishRound({ ...match, round: playout(match.round, lcg(5)) });
    expect(matchProtocol(match).rounds).toHaveLength(1);
  });

  it('воспроизведение даёт то же состояние, что и игра', () => {
    const { match } = twoRounds();
    const p = matchProtocol(match);
    expect(replayRound(p.rounds[1]!, p.variant, 1)).toEqual(match.round);
    const first = replayRound(p.rounds[0]!, p.variant, 0);
    expect(first.phase).toBe('over');
    expect(first.result).toEqual(p.rounds[0]!.result);
  });

  it('upTo: первые N ходов; больше длины — все', () => {
    const { match, secondStart } = twoRounds();
    const p = matchProtocol(match).rounds[1]!;
    expect(replayRound(p, BASE_VARIANT, 1, 0)).toEqual(secondStart);
    expect(replayRound(p, BASE_VARIANT, 1, 2).history).toHaveLength(2);
    expect(replayRound(p, BASE_VARIANT, 1, 999)).toEqual(match.round);
  });

  it('нелегальный ход в протоколе — исключение с номером хода', () => {
    const { match } = twoRounds();
    const p = matchProtocol(match).rounds[1]!;
    const broken = { ...p, moves: [p.moves[0]!, { type: 'place', tile: '9-9', train: 'mx' } as const] };
    expect(() => replayRound(broken, BASE_VARIANT, 1)).toThrow(/^ход 2: Нелегальный ход/);
  });

  it('validateProtocol: целый протокол проходит, испорченный — с номером раунда', () => {
    const { match } = twoRounds();
    const p = matchProtocol(match);
    expect(validateProtocol(p)).toEqual({ ok: true });
    const bad: MatchProtocol = {
      ...p,
      rounds: [p.rounds[0]!, { ...p.rounds[1]!, moves: [DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW, DRAW] }],
    };
    const check = validateProtocol(bad);
    expect(check.ok).toBe(false);
    expect(check).toMatchObject({ round: 1 });
  });
});
