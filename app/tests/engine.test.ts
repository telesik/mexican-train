// Игра по контракту общего кода (GameEngine): вариант, раздача по номеру
// раунда, политика матча и бот — те же, что у прямых функций движка.
import { describe, expect, it } from 'vitest';
import {
  BASE_VARIANT,
  ROUNDS,
  chooseBotMove,
  legalMoves,
  mexicanTrainEngine as engine,
  newRound,
} from '../src/engine';

describe('mexicanTrainEngine', () => {
  it('имя игры, редакция правил, вариант по умолчанию', () => {
    expect(engine.id).toBe('mexican-train');
    expect(engine.protocolFormat).toBeUndefined();
    expect(engine.rulesVersion).toBe('1.0');
    expect(engine.defaultVariant).toEqual(BASE_VARIANT);
  });

  it('канон и сравнение варианта — по номеру редакции', () => {
    const noisy = { v: 1, extra: true } as unknown as typeof BASE_VARIANT;
    expect(engine.canonVariant(noisy)).toEqual({ v: 1 });
    expect(engine.sameVariant(BASE_VARIANT, noisy)).toBe(true);
    expect(engine.sameVariant(BASE_VARIANT, { v: 2 } as unknown as typeof BASE_VARIANT)).toBe(false);
  });

  it('номер раунда задаёт локомотив', () => {
    expect(engine.newRound({ seed: 7, first: 1, index: 2, variant: BASE_VARIANT })).toEqual(
      newRound({ seed: 7, first: 1, round: 2, variant: BASE_VARIANT }),
    );
    expect(engine.newRound({ seed: 7, first: 0, index: 6, variant: BASE_VARIANT }).loco).toBe(0);
  });

  it('исход матча: до седьмого раунда — нет; меньшая сумма побеждает; поровну — ничья', () => {
    expect(engine.matchOutcome([0, 90], ROUNDS - 1, BASE_VARIANT)).toBeNull();
    expect(engine.matchOutcome([14, 17], ROUNDS, BASE_VARIANT)).toEqual({ kind: 'win', winner: 0 });
    expect(engine.matchOutcome([17, 14], ROUNDS, BASE_VARIANT)).toEqual({ kind: 'win', winner: 1 });
    expect(engine.matchOutcome([6, 6], ROUNDS, BASE_VARIANT)).toEqual({ kind: 'draw' });
  });

  it('следующий раунд начинает победитель, при равенстве — другой игрок', () => {
    expect(engine.nextFirst({ first: 0, winner: 1 })).toBe(1);
    expect(engine.nextFirst({ first: 1, winner: 1 })).toBe(1);
    expect(engine.nextFirst({ first: 0, winner: null })).toBe(1);
    expect(engine.nextFirst({ first: 1, winner: null })).toBe(0);
  });

  it('бот через контракт выбирает тот же ход, что и напрямую', () => {
    let s = newRound({ seed: 21, first: 0, round: 0, variant: BASE_VARIANT });
    // До позиции с выбором: локомотив выставлен, ходов больше одного.
    for (let i = 0; i < 60 && (s.phase === 'loco' || legalMoves(s).length < 2); i++) {
      s = engine.applyMove(s, legalMoves(s)[0]!);
    }
    expect(legalMoves(s).length).toBeGreaterThan(1);
    const viaEngine = engine.chooseBotMove!(s, { seat: s.current, level: 'normal', totals: [0, 0], seed: 5 });
    expect(viaEngine).toEqual(chooseBotMove(s, { level: 'normal', seed: 5 }));
    expect(engine.legalMoves(s).some((m) => engine.moveEquals(m, viaEngine))).toBe(true);
  });
});
