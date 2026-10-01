// Приложение «Мексиканский поезд»: общий каркас студии (экраны, руки, базар,
// история, настройки, оркестровка ходов — подмодуль commons/,
// telesik-web-commons) плюс игра (game.ts: виды, тексты, стол трёх поездов).

import { initShell } from '../../../commons/src/shell/shell';
import type {
  AppHandle as ShellAppHandle,
  AppOptions as ShellAppOptions,
  StartSetup as ShellStartSetup,
} from '../../../commons/src/shell/types';
import type { GameState, MatchOutcome, Move, RoundResult, Variant } from '../engine';
import { createGame } from './game';
import { detectLocale, getLocale, L, LOCALES, setLocale, type Locale } from './i18n';

export type { KVStore } from '../../../commons/src/store';
export type {
  ExtraAction,
  ExtraToggle,
  NextRoundWait,
  OpponentOption,
} from '../../../commons/src/shell/types';

/** Ключи хранилища: сейв матча и настройки интерфейса. */
export const LS_KEY = 'p171-match-v1';
export const LS_UI_KEY = 'p171-ui-v1';

/** Параметры старта матча, собранные стартовым экраном. */
export type StartSetup = ShellStartSetup<Variant>;

/** Что платформа (веб-вход, мобильная надстройка) настраивает в приложении. */
export type AppOptions = ShellAppOptions<GameState, Move, Variant, RoundResult, MatchOutcome>;

/** Управление приложением снаружи: вход внешних ходов и чтение состояния. */
export type AppHandle = ShellAppHandle<GameState, Move, Variant, RoundResult, MatchOutcome>;

export function initApp(opts: AppOptions = {}): AppHandle {
  return initShell({
    ...opts,
    game: createGame(),
    keys: { match: LS_KEY, ui: LS_UI_KEY },
    i18n: {
      getLocale,
      // Коды приходят из LOCALES — того же списка, что рисует селектор.
      setLocale: (code) => setLocale(code as Locale),
      detectLocale,
      locales: LOCALES,
    },
    texts: L,
    build: { version: __APP_VERSION__, hash: __GIT_HASH__ },
  });
}
