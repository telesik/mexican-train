// @vitest-environment jsdom
// Вход веб-версии: страница плюс приложение без опций платформы.
import { describe, expect, it, vi } from 'vitest';
import { installDomStubs, mountIndexHtml, q } from './dom-helpers';

vi.mock('../../commons/src/sound', () => ({
  playDraw: vi.fn(),
  playPlace: vi.fn(),
  playShuffle: vi.fn(),
  setSoundEnabled: vi.fn(),
}));

describe('вход веб-версии', () => {
  it('страница оживает: открыта стартовая карточка, соперник — бот', async () => {
    installDomStubs();
    mountIndexHtml();
    localStorage.setItem('p171-ui-v1', JSON.stringify({ howtoShown: true, locale: 'ru' }));
    await import('../src/main');
    expect(q('#overlay').hidden).toBe(false);
    expect(q('#overlay h1').textContent).toContain('Mexican Train');
    expect([...q<HTMLSelectElement>('#inp-opp').options].map((o) => o.value)).toEqual(['easy', 'normal', 'strong']);
  });
});
