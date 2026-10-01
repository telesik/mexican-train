// «Как играть» — пять коротких слайдов с картинками на графике костей:
// локомотив и три поезда, ход, добор и открытый поезд, дубль, конец раунда
// и счёт. Нюансы правил сюда не входят — последний слайд ведёт на полный
// текст. Оверлей и кирпичики сцен — общий модуль студии (подмодуль commons/,
// telesik-web-commons); здесь — слайды.
import {
  openHowTo as openHowToFrame,
  openHowToAsk as openHowToAskFrame,
  scene,
  sceneArrow as arrow,
  sceneBack as back,
  sceneEndMark as endMark,
  sceneLabel as label,
  sceneTile as tile,
  type HowtoSlide,
} from '../../../commons/src/howto';
import { TILE_L, TILE_W } from '../../../commons/src/tile-svg';
import { L } from './i18n';
import { logoSvg } from './logo';

export type { HowtoSlide };

/** Масштаб костей на слайдах и их размеры при нём. */
const SC = 0.72;
const TL = TILE_L * SC;
const TW = TILE_W * SC;

/** Кость поезда: i-я по счёту от локомотива в ряду на высоте y. */
function car(a: number, b: number, i: number, y: number, x0 = 96): string {
  return tile(a, b, x0 + TL / 2 + i * (TL + 4), y, { scale: SC });
}

/** Локомотив: дубль стоймя слева. */
function engine(v: number, y: number): string {
  return tile(v, v, 56, y, { vertical: true, accent: true, scale: SC });
}

/** Пять слайдов на текущем языке. */
export function howtoSlides(): HowtoSlide[] {
  const t = L();
  // Локомотив и три поезда: соперника сверху, мексиканский посередине, свой снизу.
  const s1 = scene(
    380,
    250,
    `${engine(6, 128)}
     ${label(96, 30, t.tableOpponent, { anchor: 'start', dim: true })} ${car(6, 3, 0, 56)}
     ${label(96, 102, t.tableMexican, { anchor: 'start', dim: true })} ${car(6, 1, 0, 128)}
     ${label(96, 174, t.tableYours, { anchor: 'start', dim: true })} ${car(6, 4, 0, 200)} ${car(4, 2, 1, 200)}`,
  );
  // Ход: кость к концу поезда тем же числом.
  const s2 = scene(
    380,
    130,
    `${engine(5, 70)} ${car(5, 2, 0, 70)} ${car(2, 4, 1, 70)}
     ${arrow(96 + 2 * (TL + 4) + 4, 70, 96 + 2 * (TL + 4) + 34, 70)} ${endMark(96 + 2 * (TL + 4) + 56, 70, 4)}`,
  );
  // Добор: кость из базара; не подошла — свой поезд открыт.
  const s3 = scene(
    380,
    190,
    `${label(96, 30, `${t.tableYours} · ${t.tableOpen}`, { anchor: 'start' })}
     ${engine(6, 72)} ${car(6, 4, 0, 72)} ${car(4, 2, 1, 72)}
     ${back(70, 150, { scale: SC })} ${back(78, 160, { scale: SC })} ${back(86, 170, { scale: SC })}
     ${label(140, 166, t.howtoBoneyard, { anchor: 'start', dim: true })}
     ${arrow(250, 160, 300, 160)} ${tile(1, 3, 334, 160, { vertical: true, scale: SC })}`,
  );
  // Дубль: поперёк и сразу продолжение.
  const dx = 96 + TL + 4 + TW / 2;
  const s4 = scene(
    380,
    130,
    `${car(4, 3, 0, 66)}
     ${tile(3, 3, dx, 66, { vertical: true, scale: SC })}
     ${tile(3, 5, dx + TW / 2 + 4 + TL / 2, 66, { scale: SC })}
     ${arrow(dx + TW / 2 + 8 + TL + 4, 66, dx + TW / 2 + 8 + TL + 34, 66)} ${endMark(dx + TW / 2 + 8 + TL + 56, 66, 5)}`,
  );
  // Счёт: очки на оставшихся костях; одинокая 0:0 — 25.
  const s5 = scene(
    380,
    150,
    `${tile(2, 3, 70 + TL / 2, 46, { scale: SC })} ${tile(4, 1, 70 + TL + 6 + TL / 2, 46, { scale: SC })}
     ${label(70 + 2 * TL + 20, 52, '= 10', { anchor: 'start' })}
     ${tile(0, 0, 70 + TL / 2, 108, { scale: SC })}
     ${label(70 + TL + 20, 114, '= 25', { anchor: 'start' })}`,
  );
  return [
    { title: t.howtoS1Title, text: t.howtoS1Text, sub: t.howtoS1Sub, scene: s1 },
    { title: t.howtoS2Title, text: t.howtoS2Text, sub: t.howtoS2Sub, scene: s2 },
    { title: t.howtoS3Title, text: t.howtoS3Text, sub: t.howtoS3Sub, scene: s3 },
    { title: t.howtoS4Title, text: t.howtoS4Text, sub: t.howtoS4Sub, scene: s4 },
    { title: t.howtoS5Title, text: t.howtoS5Text, sub: t.howtoS5Sub, scene: s5 },
  ];
}

export interface HowtoOptions {
  /** Адрес полного текста правил на текущем языке — ссылка на последнем слайде. */
  rulesUrl: string;
  /** Вызывается по закрытию (любому: «Понятно», «Пропустить», крестик, тап по фону). */
  onClose?: () => void;
}

/** Открыть слайды. Повторный вызов при открытом оверлее — начать с первого. */
export function openHowTo(opts: HowtoOptions): void {
  const t = L();
  openHowToFrame({
    slides: howtoSlides(),
    texts: {
      close: t.howtoClose,
      kicker: t.howtoKicker,
      fullRules: t.howtoFullRules,
      back: t.howtoBack,
      skip: t.howtoSkip,
      next: t.howtoNext,
      done: t.howtoDone,
    },
    rulesUrl: opts.rulesUrl,
    onClose: opts.onClose,
  });
}

export interface HowtoAskOptions {
  /** Игрок хочет посмотреть слайды. */
  onShow: () => void;
  /** «Позже» или тап по фону — вопрос больше не задаём. */
  onLater: () => void;
}

/** Вопрос при первом запуске после установки: слайды — только по согласию. */
export function openHowToAsk(opts: HowtoAskOptions): void {
  const t = L();
  openHowToAskFrame({
    logo: logoSvg(64, 'ask-logo'),
    texts: { ask: t.howtoAsk, later: t.howtoAskLater, yes: t.howtoAskYes },
    onShow: opts.onShow,
    onLater: opts.onLater,
  });
}
