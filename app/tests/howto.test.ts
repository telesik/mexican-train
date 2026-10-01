// @vitest-environment jsdom
// «Как играть»: пять слайдов, навигация, ссылка на полные правила на
// последнем; вопрос первого запуска; все языки дают полный набор слайдов.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { howtoSlides, openHowTo, openHowToAsk } from '../src/ui/howto';
import { L, LOCALES, setLocale } from '../src/ui/i18n';

const root = (): HTMLElement | null => document.getElementById('howto');
const kicker = (): string => root()?.querySelector('.howto-kicker')?.textContent ?? '';
const click = (sel: string): void => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`нет ${sel}`);
  el.click();
};

beforeEach(() => {
  setLocale('ru');
  document.body.innerHTML = '';
});

describe('слайды «Как играть»', () => {
  it('пять слайдов, у каждого заголовок, текст, пояснение и сцена с костями', () => {
    const slides = howtoSlides();
    expect(slides).toHaveLength(5);
    for (const s of slides) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.sub!.length).toBeGreaterThan(0);
      expect(s.scene).toContain('<svg');
      expect(s.scene).toContain('tile-face');
    }
    // Первый слайд подписывает три поезда; третий — открытый поезд и базар.
    expect(slides[0]!.scene).toContain('мексиканский поезд');
    expect(slides[2]!.scene).toContain('ваш поезд · открыт');
    expect(slides[2]!.scene).toContain('базар');
  });

  it('навигация: далее до конца, назад, ссылка на правила, «Понятно» закрывает', () => {
    const onClose = vi.fn();
    openHowTo({ rulesUrl: 'https://example.test/rules', onClose });
    expect(kicker()).toContain('1 из 5');
    for (let i = 0; i < 4; i++) click('#howto [data-howto="next"]');
    expect(kicker()).toContain('5 из 5');
    expect(root()!.querySelector('a[href="https://example.test/rules"]')!.textContent).toContain('Полные правила');
    click('#howto [data-howto="prev"]');
    expect(kicker()).toContain('4 из 5');
    click('#howto [data-howto="next"]');
    click('#howto [data-howto="done"]');
    expect(root()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('«Пропустить» и крестик закрывают; обработчик закрытия не обязателен', () => {
    openHowTo({ rulesUrl: 'x' });
    click('#howto [data-howto="skip"]');
    expect(root()).toBeNull();
    openHowTo({ rulesUrl: 'x' });
    expect(root()!.querySelector('.howto-close')!.getAttribute('aria-label')).toBe('Закрыть');
    click('#howto [data-howto="close"]');
    expect(root()).toBeNull();
  });

  it('вопрос первого запуска: «Показать» и «Позже»', () => {
    const onShow = vi.fn();
    const onLater = vi.fn();
    openHowToAsk({ onShow, onLater });
    expect(document.body.textContent).toContain('Показать, как играть?');
    expect(document.body.innerHTML).toContain('ask-logo');
    const buttons = [...document.querySelectorAll<HTMLElement>('button')];
    buttons.find((b) => b.textContent === 'Показать')!.click();
    expect(onShow).toHaveBeenCalledTimes(1);
    openHowToAsk({ onShow, onLater });
    [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Позже')!.click();
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('все языки: строки на месте, слайды строятся', () => {
    for (const { code } of LOCALES) {
      setLocale(code);
      expect(L().howtoKicker(2, 5)).toContain('2');
      expect(howtoSlides(), code).toHaveLength(5);
    }
  });
});
