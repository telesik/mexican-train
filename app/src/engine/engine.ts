// «Мексиканский поезд» глазами общего кода студии: правила, политика матча
// и бот собраны в один объект по контракту GameEngine (подмодуль commons/).
// Матч, протокол и каркас приложения работают с игрой только через него.

import type { GameEngine } from '../../../commons/src/engine';
import { chooseBotMove } from './bot';
import { applyMove, legalMoves, moveEquals, newRound } from './rules';
import {
  BASE_VARIANT,
  ROUNDS,
  otherPlayer,
  type GameState,
  type LogEntry,
  type Move,
  type Player,
  type RoundResult,
  type Variant,
} from './state';

/** Исход матча: побеждает меньшая сумма очков за семь раундов; поровну — ничья. */
export type MatchOutcome =
  | { readonly kind: 'win'; readonly winner: Player }
  | { readonly kind: 'draw' };

export const mexicanTrainEngine: GameEngine<GameState, Move, Variant, RoundResult, LogEntry, MatchOutcome> = {
  id: 'mexican-train',
  rulesVersion: '1.0',
  defaultVariant: BASE_VARIANT,
  canonVariant: (v) => ({ v: v.v }),
  sameVariant: (a, b) => a.v === b.v,

  // Номер раунда задаёт локомотив: 6-6 в первом, 0-0 в седьмом.
  newRound: ({ seed, first, index, variant }) => newRound({ seed, first, round: index, variant }),
  legalMoves,
  applyMove,
  moveEquals,

  matchOutcome(totals, rounds) {
    if (rounds < ROUNDS) return null;
    return totals[0] === totals[1]
      ? { kind: 'draw' }
      : { kind: 'win', winner: totals[0] < totals[1] ? 0 : 1 };
  },
  // Следующий раунд начинает победитель предыдущего; поровну — другой игрок.
  nextFirst: (last) => last.winner ?? otherPlayer(last.first),

  chooseBotMove: (s, o) => chooseBotMove(s, { level: o.level, seed: o.seed }),
};
