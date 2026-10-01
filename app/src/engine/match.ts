// Матч — семь раундов: локомотивы от 6-6 до 0-0. Побеждает меньшая сумма
// очков; равенство — ничья.

import { seedFromCrypto, type RngState } from './rng';
import { newRound } from './rules';
import {
  ROUNDS,
  otherPlayer,
  type GameState,
  type Move,
  type Player,
  type RoundResult,
  type Variant,
} from './state';

export type BotLevel = 'easy' | 'normal' | 'strong';

/** За какую сторону и с какой силой играет бот. */
export interface BotSeat {
  readonly player: Player;
  readonly level: BotLevel;
}

export interface FinishedRound extends RoundResult {
  /** Номер раунда, с 0. */
  readonly round: number;
  /** Кто был первым игроком в этом раунде. */
  readonly first: Player;
  /** Seed раунда — для воспроизведения по протоколу. */
  readonly seed: RngState;
  /** Протокол раунда: все ходы по порядку. */
  readonly moves: readonly Move[];
}

export type MatchOutcome =
  | { readonly kind: 'win'; readonly winner: Player }
  | { readonly kind: 'draw' };

export interface MatchState {
  readonly names: readonly [string, string];
  readonly totals: readonly [number, number];
  readonly rounds: readonly FinishedRound[];
  readonly variant: Variant;
  /** Первый игрок текущего раунда. */
  readonly first: Player;
  readonly round: GameState;
  readonly outcome: MatchOutcome | null;
  /** Бот за одной из сторон; null — двое людей на одном устройстве или по сети. */
  readonly bot: BotSeat | null;
}

export interface StartMatchOptions {
  readonly names: readonly [string, string];
  /** Кому выпал жребий: он первым выставляет локомотив (или тянет) в первом раунде. */
  readonly first: Player;
  readonly variant: Variant;
  readonly seed?: RngState;
  readonly bot?: BotSeat | null;
}

export function startMatch(opts: StartMatchOptions): MatchState {
  const seed = opts.seed ?? seedFromCrypto();
  return {
    names: opts.names,
    totals: [0, 0],
    rounds: [],
    variant: opts.variant,
    first: opts.first,
    round: newRound({ seed, first: opts.first, round: 0, variant: opts.variant }),
    outcome: null,
    bot: opts.bot ?? null,
  };
}

/**
 * Принять результат завершённого раунда: прибавить очки, после седьмого
 * раунда — подвести итог матча.
 */
export function finishRound(match: MatchState): MatchState {
  const cur = match.round;
  const result = cur.result;
  if (!result) throw new Error('Раунд ещё не завершён');
  if (match.rounds.length !== cur.round) throw new Error('Раунд уже учтён');
  const totals: [number, number] = [
    match.totals[0] + result.added[0],
    match.totals[1] + result.added[1],
  ];
  const rounds = [
    ...match.rounds,
    { ...result, round: cur.round, first: match.first, seed: cur.seed, moves: cur.history },
  ];
  let outcome: MatchOutcome | null = null;
  if (rounds.length >= ROUNDS) {
    outcome =
      totals[0] === totals[1]
        ? { kind: 'draw' }
        : { kind: 'win', winner: totals[0] < totals[1] ? 0 : 1 };
  }
  return { ...match, totals, rounds, outcome };
}

/**
 * Начать следующий раунд: первым выставляет локомотив (или тянет) победитель
 * предыдущего раунда; если победителя не было (поровну) — очередь переходит
 * к другому игроку. В первом раунде первого определяет жребий.
 */
export function nextRound(match: MatchState, seed?: RngState): MatchState {
  if (match.outcome) throw new Error('Матч окончен');
  if (match.rounds.length !== match.round.round + 1) throw new Error('Текущий раунд не учтён');
  // Проверка выше гарантирует, что последний учтённый раунд есть.
  const last = match.rounds[match.rounds.length - 1]!;
  const first = last.winner ?? otherPlayer(last.first);
  return {
    ...match,
    first,
    round: newRound({
      seed: seed ?? seedFromCrypto(),
      first,
      round: match.rounds.length,
      variant: match.variant,
    }),
  };
}
