// Словари интерфейса: одиннадцать языков с одним набором ключей; каждая
// строка непуста, каждая функция отрабатывает; склонения — по всем формам.
import { afterEach, describe, expect, it } from 'vitest';
import { detectLocale, getLocale, L, LOCALES, setLocale, type Locale } from '../src/ui/i18n';

afterEach(() => setLocale('ru'));

describe('словари', () => {
  it('одиннадцать языков; переключение реально меняет словарь', () => {
    expect(LOCALES).toHaveLength(11);
    const tag = (code: Locale): string => {
      setLocale(code);
      expect(getLocale()).toBe(code);
      return L().tableMexican;
    };
    // Три разных семьи письма: скопированный словарь не спрячется.
    expect(tag('ru')).not.toBe(tag('en'));
    expect(tag('en')).not.toBe(tag('zh'));
  });

  it('у всех словарей один набор ключей', () => {
    setLocale('ru');
    const keys = Object.keys(L()).sort();
    for (const { code } of LOCALES) {
      setLocale(code);
      expect(Object.keys(L()).sort(), code).toEqual(keys);
    }
  });

  it('каждая строка каждого словаря — непустая; каждая функция отрабатывает', () => {
    // Числовые аргументы по арности: шаблоны интерполируют их как есть,
    // склонения исполняют настоящие ветки.
    const args = [2, 5, 7, 4] as const;
    for (const { code } of LOCALES) {
      setLocale(code);
      const dict = L() as unknown as Record<string, unknown>;
      for (const [key, val] of Object.entries(dict)) {
        if (typeof val === 'function') {
          const out: unknown = (val as (...a: unknown[]) => unknown)(
            ...args.slice(0, Math.max(1, (val as { length: number }).length)),
          );
          expect(typeof out, `${code}.${key}`).toBe('string');
          expect((out as string).length, `${code}.${key}`).toBeGreaterThan(0);
          expect(out, `${code}.${key}`).not.toContain('undefined');
          expect(out, `${code}.${key}`).not.toContain('NaN');
        } else {
          expect(typeof val, `${code}.${key}`).toBe('string');
          expect((val as string).length, `${code}.${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('счётчик раунда во всех языках несёт номер и число раундов матча', () => {
    for (const { code } of LOCALES) {
      setLocale(code);
      expect(L().roundChip(3), code).toContain('3');
      expect(L().roundChip(3), code).toContain('7');
      expect(L().matchRoundLabel(3), code).toContain('3');
    }
  });

  it('склонение счёта костей: русский и украинский по всем формам', () => {
    const cases: Array<[Locale, number, string]> = [
      ['ru', 1, 'кость'], ['ru', 2, 'кости'], ['ru', 5, 'костей'],
      ['ru', 11, 'костей'], ['ru', 12, 'костей'], ['ru', 21, 'кость'], ['ru', 22, 'кости'],
      ['uk', 1, 'кістка'], ['uk', 2, 'кістки'], ['uk', 5, 'кісток'],
      ['uk', 11, 'кісток'], ['uk', 12, 'кісток'], ['uk', 21, 'кістка'], ['uk', 22, 'кістки'],
    ];
    for (const [code, n, word] of cases) {
      setLocale(code);
      expect(L().handMetaHidden(n), `${code}:${n}`).toBe(`${n} ${word}`);
      expect(L().handMeta(n, 9), `${code}:${n}`).toContain(`${n} ${word}`);
    }
  });

  it('единственное и множественное число костей во всех языках', () => {
    for (const { code } of LOCALES) {
      setLocale(code);
      for (const n of [1, 2]) {
        expect(L().handMetaHidden(n), `${code}:${n}`).toContain(String(n));
        expect(L().handMeta(n, 9), `${code}:${n}`).toContain('9');
      }
    }
    setLocale('en');
    expect(L().handMetaHidden(1)).toBe('1 tile');
    expect(L().handMetaHidden(2)).toBe('2 tiles');
  });

  it('стартовый язык — по настройке браузера; незнакомому языку — английский', () => {
    const langs = (list: string[]): void =>
      void Object.defineProperty(globalThis, 'navigator', { value: { languages: list, language: list[0] }, configurable: true });
    langs(['de-DE', 'en']);
    expect(detectLocale()).toBe('de');
    langs(['sv-SE']);
    expect(detectLocale()).toBe('en');
  });
});
