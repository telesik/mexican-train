// Логотип игры — временный знак до решения о марке: локомотив-дубль стоймя
// и три поезда-кости от него. Чистый SVG без внешних ресурсов: значок перед
// именем игры в шапке стола и на стартовой карточке.

const BONE = '#efe9db';
const INK = '#1a2320';

interface LogoTile {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Координаты 100×100: слева локомотив, справа три поезда.
const TILES: LogoTile[] = [
  { x: 6, y: 26, w: 22, h: 48 }, // локомотив
  { x: 36, y: 8, w: 46, h: 22 }, // поезд соперника
  { x: 36, y: 39, w: 58, h: 22 }, // мексиканский
  { x: 36, y: 70, w: 46, h: 22 }, // свой поезд
];

function tileMarkup(t: LogoTile): string {
  const vertical = t.h > t.w;
  const divider = vertical
    ? `<line x1="${t.x + 3}" y1="${t.y + t.h / 2}" x2="${t.x + t.w - 3}" y2="${t.y + t.h / 2}" stroke="${INK}" stroke-width="1.6"/>`
    : `<line x1="${t.x + t.w / 2}" y1="${t.y + 3}" x2="${t.x + t.w / 2}" y2="${t.y + t.h - 3}" stroke="${INK}" stroke-width="1.6"/>`;
  // По одному очку в каждой половине — знак, а не конкретная кость.
  const pips = vertical
    ? [
        [t.x + t.w / 2, t.y + t.h / 4],
        [t.x + t.w / 2, t.y + (t.h * 3) / 4],
      ]
    : [
        [t.x + t.w / 4, t.y + t.h / 2],
        [t.x + (t.w * 3) / 4, t.y + t.h / 2],
      ];
  return `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="4" fill="${BONE}"/>${divider}${pips
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3" fill="${INK}"/>`)
    .join('')}`;
}

/** Логотип высотой heightPx; extraClass — класс места (шапка, карточка, вопрос обучения). */
export function logoSvg(heightPx: number, extraClass = ''): string {
  return `<svg class="logo ${extraClass}" width="${heightPx}" height="${heightPx}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
${TILES.map(tileMarkup).join('\n')}
</svg>`;
}
