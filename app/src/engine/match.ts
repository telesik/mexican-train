// Матч — семь раундов: локомотивы от 6-6 до 0-0. Побеждает меньшая сумма
// очков; равенство — ничья. Порядок матча общий для игр студии (подмодуль
// commons/); политика игры — число раундов и право первого хода — в engine.ts.

import {
  finishRound as kitFinishRound,
  nextRound as kitNextRound,
  startMatch as kitStartMatch,
  type FinishedRound as KitFinishedRound,
  type MatchState as KitMatchState,
  type StartMatchOptions as KitStartMatchOptions,
} from '../../../commons/src/match';
import { mexicanTrainEngine, type MatchOutcome } from './engine';
import type { RngState } from './rng';
import type { GameState, Move, RoundResult, Variant } from './state';

export type { BotLevel, BotSeat } from '../../../commons/src/engine';
export type { MatchOutcome } from './engine';

/** Учтённый раунд: итог, первый игрок, seed и ходы. Номер раунда — место в списке. */
export type FinishedRound = KitFinishedRound<Move, RoundResult>;

/** bot: null — соперник-человек (партия по сети). */
export type MatchState = KitMatchState<GameState, Move, Variant, RoundResult, MatchOutcome>;

/** first — кому выпал жребий: он первым выставляет локомотив (или тянет) в первом раунде. */
export type StartMatchOptions = KitStartMatchOptions<Variant>;

export function startMatch(opts: StartMatchOptions): MatchState {
  return kitStartMatch(mexicanTrainEngine, opts);
}

/**
 * Принять результат завершённого раунда: прибавить очки, после седьмого
 * раунда — подвести итог матча.
 */
export function finishRound(match: MatchState): MatchState {
  const cur = match.round;
  // Локомотив раунда задаётся его номером, поэтому учёт строгий: один раз.
  if (cur.result && match.rounds.length !== cur.round) throw new Error('Раунд уже учтён');
  return kitFinishRound(mexicanTrainEngine, match);
}

/**
 * Начать следующий раунд: первым выставляет локомотив (или тянет) победитель
 * предыдущего раунда; если победителя не было (поровну) — очередь переходит
 * к другому игроку. В первом раунде первого определяет жребий.
 */
export function nextRound(match: MatchState, seed?: RngState): MatchState {
  if (match.outcome) throw new Error('Матч окончен');
  if (match.rounds.length !== match.round.round + 1) throw new Error('Текущий раунд не учтён');
  return kitNextRound(mexicanTrainEngine, match, seed);
}
