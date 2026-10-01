// Подсчёт очков раунда.

import { pipSum, type TileId } from './tiles';
import type { RoundEndCause, RoundResult } from './state';

/** Штраф за одинокую 0-0: единственная кость, оставшаяся на руке. */
export const LONE_BLANK_PENALTY = 25;

/**
 * Сумма очков на руке. Одинокая 0-0 — 25; в компании других костей 0-0
 * стоит 0, как обычно.
 */
export function handSum(hand: readonly TileId[]): number {
  if (hand.length === 1 && hand[0] === '0-0') return LONE_BLANK_PENALTY;
  return hand.reduce((acc, t) => acc + pipSum(t), 0);
}

/**
 * Итог раунда: каждый получает сумму очков на своей руке (вышедший — 0).
 * Победитель раунда — у кого сумма меньше; поровну — победителя нет.
 */
export function scoreRound(
  hands: readonly [readonly TileId[], readonly TileId[]],
  cause: RoundEndCause,
): RoundResult {
  const s0 = handSum(hands[0]);
  const s1 = handSum(hands[1]);
  const winner = s0 < s1 ? 0 : s1 < s0 ? 1 : null;
  return { cause, sums: [s0, s1], added: [s0, s1], winner };
}
