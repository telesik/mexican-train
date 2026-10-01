// @vitest-environment jsdom
// Приложение целиком: страница, общий каркас и игра вместе — старт против
// бота через жребий, ходы кликами, итоги раунда, следующий раунд, история,
// продолжение сохранённого матча, язык.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_VARIANT, ROUNDS, legalMoves, startMatch, type MatchState } from '../src/engine';
import { getLocale } from '../src/ui/i18n';
import {
  click,
  has,
  LS_KEY,
  LS_UI_KEY,
  mountApp,
  playRoundToEnd,
  playUntil,
  q,
  setValue,
  startFixture,
  unmountApps,
  useFakeClock,
} from './dom-helpers';

vi.mock('../../commons/src/sound', () => ({
  playDraw: vi.fn(),
  playPlace: vi.fn(),
  playShuffle: vi.fn(),
  setSoundEnabled: vi.fn(),
}));

beforeEach(() => {
  useFakeClock();
  localStorage.clear();
});
afterEach(() => {
  unmountApps();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const overlay = (): HTMLElement => q('#overlay');
const options = (sel: string): string[] => [...q<HTMLSelectElement>(sel).options].map((o) => o.value);
const labels = (): string[] => [...document.querySelectorAll('#board .train-label')].map((e) => e.textContent ?? '');
/** Клики в первые мгновения после старта каркас гасит — дать часам пройти. */
const settleClock = (): void => void vi.advanceTimersByTime(400);

/** Seed, при котором локомотив первого раунда (6:6) на руке у игрока seat. */
function seedWithLoco(seat: 0 | 1): number {
  for (let seed = 1; seed < 500; seed++) {
    const m = startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed });
    if (m.round.hands[seat].includes('6-6')) return seed;
  }
  throw new Error('seed не найден');
}

describe('приложение: старт', () => {
  it('стартовая карточка: имя игры с логотипом, соперник — только бот, язык из настроек', () => {
    mountApp();
    expect(overlay().hidden).toBe(false);
    expect(overlay().querySelector('h1')!.textContent).toContain('Mexican Train');
    expect(overlay().querySelector('h1 svg.logo')).not.toBeNull();
    // Игры вдвоём за одним экраном нет: в списке — три уровня бота.
    expect(options('#inp-opp')).toEqual(['easy', 'normal', 'strong']);
    expect(getLocale()).toBe('ru');
    expect(q<HTMLButtonElement>('#btn-start').disabled).toBe(true);
  });

  it('жребий и старт против бота: руки, базар, место локомотива, счётчик раунда', () => {
    // Жребий: у игрока 0:0, у бота 6:6 — меньшая сумма начинает.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    const { app, storage } = mountApp();
    setValue('#inp-n0', 'Аня');
    click(q('[data-action="lot"]'));
    click(q('[data-action="start"]'));
    const match = app.getMatch()!;
    expect(match.names[0]).toBe('Аня');
    expect(match.first).toBe(0);
    expect(match.bot).toEqual({ player: 1, level: 'easy' });
    expect(match.variant).toEqual(BASE_VARIANT);
    expect(match.round.phase).toBe('loco');
    expect(overlay().hidden).toBe(true);
    expect(q('#round-chip').textContent).toBe('раунд 1/7');
    // Своя рука внизу открыта, рука бота сверху — рубашками.
    expect(document.querySelectorAll('#hand-bottom .hand-tile[data-tile]')).toHaveLength(7);
    expect(document.querySelectorAll('#hand-top .hand-tile[data-tile]')).toHaveLength(0);
    expect(document.querySelectorAll('#hand-top .hand-tile')).toHaveLength(7);
    expect(q('#hand-top').textContent).toContain('7 костей');
    expect(q('#hand-bottom').textContent).toMatch(/7 костей · \d+ очк\./);
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(14);
    expect(has('#board .ghost.loco-wait')).toBe(true);
    expect(labels()).toEqual(['поезд соперника', 'мексиканский поезд', 'ваш поезд']);
    expect(JSON.parse(storage.mem.get(LS_KEY)!).match.round.loco).toBe(6);
    expect(JSON.parse(storage.mem.get(LS_UI_KEY)!).p1Name).toBe('Аня');
  });

  it('смена языка на стартовой карточке переводит интерфейс и стол', () => {
    const { app, storage } = mountApp();
    setValue('#inp-lang-start', 'en');
    expect(getLocale()).toBe('en');
    expect(JSON.parse(storage.mem.get(LS_UI_KEY)!).locale).toBe('en');
    startFixture(app);
    expect(labels()).toEqual(['opponent’s train', 'Mexican train', 'your train']);
    expect(q('#round-chip').textContent).toContain('1/7');
  });
});

describe('приложение: игра', () => {
  it('локомотив ставится кликом по кости и по тени в центре стола', () => {
    const { app } = mountApp();
    startFixture(app, { seed: seedWithLoco(0) });
    settleClock();
    expect(q('#status-prompt').textContent).toContain('выставьте локомотив 6:6');
    expect(q('#tutor-bar').textContent).toContain('Раунд открывает локомотив');
    click(q('#hand-bottom .hand-tile[data-tile="6-6"]'));
    const ghost = q<SVGElement>('#board .ghost[data-move]');
    click(ghost);
    const round = app.getMatch()!.round;
    expect(round.phase).toBe('main');
    expect(round.history).toMatchObject([{ type: 'loco' }]);
    expect(has('#board .placed.loco')).toBe(true);
    expect(has('#board .ghost.loco-wait')).toBe(false);
    expect(document.querySelectorAll('#hand-bottom .hand-tile[data-tile]')).toHaveLength(6);
  });

  it('кость ставится на поезд: выбор в руке, тени по поездам, клик по тени', () => {
    const { app } = mountApp();
    startFixture(app, { seed: seedWithLoco(0) });
    settleClock();
    app.dispatch({ type: 'loco' });
    // Довести до своего хода с костью, которую можно поставить.
    const ready = playUntil(app, (s, moves) => s.current === 0 && moves[0]!.type === 'place');
    expect(ready).toBe(true);
    vi.advanceTimersByTime(2000);
    const before = app.getMatch()!.round;
    const move = legalMoves(before)[0]!;
    if (move.type !== 'place') throw new Error('ожидался ход костью');
    click(q(`#hand-bottom .hand-tile[data-tile="${move.tile}"]`));
    const ghosts = document.querySelectorAll<SVGElement>('#board .ghost[data-move]');
    expect(ghosts.length).toBeGreaterThan(0);
    click(ghosts[0]);
    const after = app.getMatch()!.round;
    expect(after.history.length).toBe(before.history.length + 1);
    expect(after.history.at(-1)!.type).toBe('place');
    expect(has(`#board .placed[data-seq="${after.seq - 1}"]`)).toBe(true);
  });

  it('место внизу — у игрока за этим экраном: за вторым местом внизу рука второго', () => {
    const { app } = mountApp();
    startFixture(app, { remoteSeat: 0 });
    const round = app.getMatch()!.round;
    const shown = [...document.querySelectorAll<HTMLElement>('#hand-bottom .hand-tile[data-tile]')].map((e) => e.dataset.tile);
    expect([...shown].sort()).toEqual([...round.hands[1]].sort());
    expect(labels()).toEqual(['поезд соперника', 'мексиканский поезд', 'ваш поезд']);
  });

  it('раунд до конца: итоги, счёт, следующий раунд с локомотивом 5:5', () => {
    const { app } = mountApp();
    startFixture(app);
    playRoundToEnd(app);
    vi.advanceTimersByTime(3000);
    const match = app.getMatch()!;
    expect(match.rounds).toHaveLength(1);
    expect(overlay().hidden).toBe(false);
    expect(overlay().textContent).toContain('Раунд 1 из 7');
    expect(overlay().textContent).toContain('Следующий раунд начинает');
    expect(overlay().querySelectorAll('.result-name')).toHaveLength(2);
    click(q('[data-action="next-round"]'));
    vi.advanceTimersByTime(3000);
    const next = app.getMatch()!;
    expect(next.round.round).toBe(1);
    expect(next.round.loco).toBe(5);
    expect(q('#round-chip').textContent).toBe('раунд 2/7');
    expect(q('#board .loco-wait title').textContent).toBe('локомотив 5:5');
  });

  it('история: просмотр сыгранных ходов, список раундов', () => {
    const { app } = mountApp();
    startFixture(app, { seed: seedWithLoco(0) });
    app.setRemoteSeat(null);
    for (let i = 0; i < 4; i++) app.dispatch(legalMoves(app.getMatch()!.round)[0]!);
    vi.advanceTimersByTime(3000);
    click(q('#btn-hist'));
    expect(q('#history-bar').hidden).toBe(false);
    expect(q('#replay-pos').textContent).toBe('ход 4/4');
    expect(q<HTMLSelectElement>('#replay-round').options[0]!.textContent).toBe('Раунд 1 — идёт');
    click(q('[data-action="replay-first"]'));
    expect(has('#board .ghost.loco-wait')).toBe(true);
    click(q('[data-action="replay-next"]'));
    expect(has('#board .placed.loco')).toBe(true);
    expect(q('#status-prompt').textContent).toContain('локомотив 6:6');
    click(q('[data-action="replay-exit"]'));
    expect(q('#history-bar').hidden).toBe(true);
  });
});

describe('приложение: сохранённый матч', () => {
  const saved = (): MatchState =>
    startMatch({ names: ['Аня', 'Бот'], first: 0, variant: BASE_VARIANT, seed: 11, bot: { player: 1, level: 'strong' } });

  it('годный сейв продолжается: карточка предлагает продолжить, стол и руки на месте', () => {
    const { app } = mountApp({ saved: saved() });
    expect(q('[data-action="continue"]').textContent).toBe('Продолжить матч Аня 0:0 Бот');
    click(q('[data-action="continue"]'));
    expect(overlay().hidden).toBe(true);
    const match = app.getMatch()!;
    expect(match.names).toEqual(['Аня', 'Бот']);
    expect(match.round.seed).toBe(11);
    expect(document.querySelectorAll('#hand-bottom .hand-tile[data-tile]')).toHaveLength(7);
    expect(q('#round-chip').textContent).toBe(`раунд 1/${ROUNDS}`);
  });

  it('негодный сейв стирается, приложение стартует с карточки', () => {
    const broken = { ...saved(), round: { ...saved().round, loco: 0 } } as MatchState;
    const { app, storage } = mountApp({ saved: broken });
    expect(app.getMatch()).toBeNull();
    expect(storage.mem.has(LS_KEY)).toBe(false);
    expect(overlay().hidden).toBe(false);
  });
});
