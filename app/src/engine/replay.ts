// Протокол ходов и воспроизведение раундов.
//
// Раунд полностью определяется (seed, first, round, variant) и списком
// ходов: раздача и порядок базара выводятся из seed. Это основа режима
// истории, сверки сетевой партии и разбора багов.

import type { RngState } from './rng';
import { applyMove, newRound } from './rules';
import type { GameState, Move, Player, RoundResult, Variant } from './state';
import type { MatchState } from './match';

export interface RoundProtocol {
  /** Номер раунда, с 0. */
  readonly round: number;
  readonly seed: RngState;
  readonly first: Player;
  readonly moves: readonly Move[];
  /** Итог раунда, если он завершён — только для отображения. */
  readonly result?: RoundResult;
}

export interface MatchProtocol {
  readonly format: 'mexican-train-protocol';
  readonly v: 1;
  readonly names: readonly [string, string];
  readonly variant: Variant;
  readonly rounds: readonly RoundProtocol[];
  readonly totals?: readonly [number, number];
}

/** Собрать протокол матча: учтённые раунды плюс текущий, если он ещё не учтён. */
export function matchProtocol(match: MatchState): MatchProtocol {
  const rounds: RoundProtocol[] = match.rounds.map((r) => ({
    round: r.round,
    seed: r.seed,
    first: r.first,
    moves: r.moves,
    result: { cause: r.cause, sums: r.sums, added: r.added, winner: r.winner },
  }));
  const cur = match.round;
  if (cur.round === match.rounds.length) {
    rounds.push({ round: cur.round, seed: cur.seed, first: cur.first, moves: cur.history });
  }
  return {
    format: 'mexican-train-protocol',
    v: 1,
    names: match.names,
    variant: match.variant,
    rounds,
    totals: match.totals,
  };
}

/**
 * Воспроизвести раунд по протоколу: первые upTo ходов (по умолчанию все).
 * Бросает исключение, если какой-то ход нелегален — так протокол проверяется
 * самим движком.
 */
export function replayRound(p: RoundProtocol, variant: Variant, upTo?: number): GameState {
  let state = newRound({ seed: p.seed, first: p.first, round: p.round, variant });
  const n = upTo === undefined ? p.moves.length : Math.min(upTo, p.moves.length);
  for (let i = 0; i < n; i++) {
    try {
      state = applyMove(state, p.moves[i]!);
    } catch (err) {
      throw new Error(`ход ${i + 1}: ${(err as Error).message}`);
    }
  }
  return state;
}

export type ProtocolCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly round: number; readonly error: string };

/** Проверить весь протокол воспроизведением через движок. */
export function validateProtocol(p: MatchProtocol): ProtocolCheck {
  for (let i = 0; i < p.rounds.length; i++) {
    try {
      replayRound(p.rounds[i]!, p.variant);
    } catch (err) {
      return { ok: false, round: i, error: (err as Error).message };
    }
  }
  return { ok: true };
}
