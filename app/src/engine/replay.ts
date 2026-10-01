// Протокол ходов и воспроизведение раундов.
//
// Раунд полностью определяется (seed, first, номер раунда, variant) и списком
// ходов: раздача и порядок базара выводятся из seed, поиск локомотива —
// обычные ходы протокола. Это основа режима истории, сверки сетевой партии и
// разбора багов. Механика общая для игр студии (подмодуль commons/).

import {
  matchProtocol as kitMatchProtocol,
  replayRound as kitReplayRound,
  validateProtocol as kitValidateProtocol,
  type MatchProtocol as KitMatchProtocol,
  type ProtocolCheck,
  type RoundProtocol as KitRoundProtocol,
} from '../../../commons/src/replay';
import { mexicanTrainEngine } from './engine';
import type { GameState, Move, RoundResult, Variant } from './state';
import type { MatchState } from './match';

export type { ProtocolCheck } from '../../../commons/src/replay';

/** Протокол раунда; result — итог, если раунд завершён (только для отображения). */
export type RoundProtocol = KitRoundProtocol<Move, RoundResult>;

/** Протокол матча. Номер раунда (он задаёт локомотив) — место в списке rounds. */
export type MatchProtocol = KitMatchProtocol<Move, Variant, RoundResult> & {
  readonly format: 'mexican-train-protocol';
};

/** Собрать протокол матча: учтённые раунды плюс текущий, если он ещё идёт. */
export function matchProtocol(match: MatchState): MatchProtocol {
  return kitMatchProtocol(mexicanTrainEngine, match) as MatchProtocol;
}

/**
 * Воспроизвести раунд с номером index по протоколу: первые upTo ходов (по
 * умолчанию все). Бросает исключение, если какой-то ход нелегален — так
 * протокол проверяется самим движком.
 */
export function replayRound(p: RoundProtocol, variant: Variant, index: number, upTo?: number): GameState {
  return kitReplayRound(mexicanTrainEngine, p, variant, index, upTo);
}

/** Проверить весь протокол воспроизведением через движок. */
export function validateProtocol(p: MatchProtocol): ProtocolCheck {
  return kitValidateProtocol(mexicanTrainEngine, p);
}
