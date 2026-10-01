// Помощники jsdom-тестов приложения: заглушки окружения, монтирование
// index.html, хранилище на Map, поддельные часы. Файл — не тест: прагма
// `@vitest-environment jsdom` стоит в тестах, которые его импортируют.

import { vi } from 'vitest';
import indexHtml from '../index.html?raw';
import { initApp, LS_KEY, LS_UI_KEY, type AppHandle, type AppOptions, type KVStore } from '../src/ui/app';
import { BASE_VARIANT, legalMoves, type GameState, type MatchState, type Move } from '../src/engine';

export { LS_KEY, LS_UI_KEY };

export interface MemStore extends KVStore {
  readonly mem: Map<string, string>;
}

export function makeStorage(initial: Record<string, string> = {}): MemStore {
  const mem = new Map(Object.entries(initial));
  return {
    mem,
    get: (k) => mem.get(k) ?? null,
    set: (k, v) => void mem.set(k, v),
    remove: (k) => void mem.delete(k),
  };
}

/** Заглушки того, чего в jsdom нет: matchMedia (стол спрашивает про «pointer: coarse»),
 *  прокрутка элементов, захват указателя. */
export function installDomStubs(): void {
  (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: false });
  Element.prototype.scrollTo = () => undefined;
  Element.prototype.setPointerCapture = () => undefined;
}

export function mountIndexHtml(): void {
  const body = /<body>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

type Listener = readonly [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const mounted: Listener[][] = [];

export interface MountOptions extends Omit<AppOptions, 'storage'> {
  /** Начальные настройки интерфейса (пишутся в хранилище до старта). */
  readonly prefs?: Record<string, unknown>;
  /** Сохранённый матч (кладётся в конверт версии 2). */
  readonly saved?: MatchState;
}

export interface Mounted {
  readonly app: AppHandle;
  readonly storage: MemStore;
}

/** Смонтировать приложение в чистый DOM; слушатели document и window запоминаются — см. unmountApps. */
export function mountApp(opts: MountOptions = {}): Mounted {
  installDomStubs();
  mountIndexHtml();
  const { prefs, saved, ...appOpts } = opts;
  const storage = makeStorage();
  storage.set(LS_UI_KEY, JSON.stringify({ howtoShown: true, locale: 'ru', ...prefs }));
  if (saved) storage.set(LS_KEY, JSON.stringify({ v: 2, match: saved }));

  const added: Listener[] = [];
  const patch = (target: EventTarget): (() => void) => {
    const orig = target.addEventListener;
    target.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, o?: unknown) {
      if (fn) added.push([target, type, fn, o]);
      return orig.call(this, type, fn, o as AddEventListenerOptions | undefined);
    } as typeof target.addEventListener;
    return () => {
      target.addEventListener = orig;
    };
  };
  const restore = [patch(document), patch(window)];
  try {
    const app = initApp({ ...appOpts, storage });
    mounted.push(added);
    return { app, storage };
  } finally {
    for (const r of restore) r();
  }
}

export function unmountApps(): void {
  for (const list of mounted.splice(0)) {
    for (const [target, type, fn, o] of list) {
      target.removeEventListener(type, fn, o as EventListenerOptions | undefined);
    }
  }
  if (vi.isFakeTimers()) vi.clearAllTimers();
}

/** Матч с внешним игроком за вторым местом: общий seed, первым ходит место 0. */
export function startFixture(app: AppHandle, over: Partial<{ seed: number; remoteSeat: 0 | 1; first: 0 | 1 }> = {}): void {
  app.startRemoteMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 7, remoteSeat: 1, ...over });
}

/** Ходить первым легальным ходом (внешними ходами), пока позиция не удовлетворит условию. */
export function playUntil(app: AppHandle, pred: (s: GameState, moves: readonly Move[]) => boolean): boolean {
  for (let i = 0; i < 400; i++) {
    const m = app.getMatch();
    if (!m || m.round.phase === 'over') return false;
    const moves = legalMoves(m.round);
    if (pred(m.round, moves)) return true;
    app.dispatch(moves[0]!);
  }
  return false;
}

/** Доиграть текущий раунд первым легальным ходом. */
export function playRoundToEnd(app: AppHandle): void {
  playUntil(app, () => false);
  if (app.getMatch()?.round.phase !== 'over') throw new Error('Раунд не завершился');
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
}

/** Клик с координатами вне экрана: клик в (0, 0) каркас принял бы за клик по куче базара. */
export function click(el: Element | null | undefined, init: MouseEventInit = {}): void {
  if (!el) throw new Error('click: элемента нет');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: -9, clientY: -9, ...init }));
}

export function q<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
}

export const has = (sel: string): boolean => document.querySelector(sel) !== null;

export function setValue(sel: string, value: string): void {
  const el = q<HTMLInputElement | HTMLSelectElement>(sel);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Поддельные часы целиком: таймеры, Date, performance.now и кадры анимации. */
export function useFakeClock(): void {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
}

export function toastText(): string {
  const t = q('#toast');
  return t.hidden ? '' : (t.textContent ?? '');
}

export const rectOf = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** Дождаться микрозадач: стол подгоняет кадр после рендера всего экрана. */
export const settle = (): Promise<void> => Promise.resolve();
