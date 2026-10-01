// Локализация интерфейса. Русский — первичный текст; остальные словари
// обязаны совпадать с ним по ключам (тип Dict). Механика — общий модуль
// студии (подмодуль commons/, telesik-web-commons); словари — в i18n/.

import { createI18n, LOCALE_LABELS } from '../../../commons/src/i18n';
import { de } from './i18n/de';
import { en } from './i18n/en';
import { es } from './i18n/es';
import { fr } from './i18n/fr';
import { it } from './i18n/it';
import { ja } from './i18n/ja';
import { ko } from './i18n/ko';
import { pt } from './i18n/pt';
import { ru, type Dict } from './i18n/ru';
import { uk } from './i18n/uk';
import { zh } from './i18n/zh';

export type { Dict };

export type Locale = (typeof LOCALE_LABELS)[number]['code'];

/** Языки в порядке списка выбора: автонимы по алфавиту (правило — в общем пакете). */
export const LOCALES: ReadonlyArray<{ code: Locale; label: string }> = LOCALE_LABELS;

const DICTS: Record<Locale, Dict> = { ru, en, es, de, pt, uk, zh, fr, it, ja, ko };

const i18n = createI18n<Locale, Dict>({ dicts: DICTS, locales: LOCALES, initial: 'ru', fallback: 'en' });

/** Текущий словарь. */
export const L = i18n.L;
export const getLocale = i18n.getLocale;
export const setLocale = i18n.setLocale;
/** Подобрать стартовый язык по настройке браузера; для прочих языков — английский. */
export const detectLocale = i18n.detectLocale;
