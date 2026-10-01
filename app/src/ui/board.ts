// Стол: SVG-сцена с локомотивом, тремя поездами и тенями доступных ходов.
// Раскладку считает layout.ts; панораму, зум и подгонку кадра ведёт общий
// модуль студии viewport (подмодуль commons/, telesik-web-commons).

import type {
  BoardHooks,
  BoardRenderOptions,
  BoardRenderer,
  GhostTarget,
  ScreenPose,
} from '../../../commons/src/shell/types';
import {
  CELL,
  PIPS,
  placedTransform,
  tileBack,
  tileCenterAngle,
  tileFace,
  TILE_L,
  TILE_R,
  TILE_W,
} from '../../../commons/src/tile-svg';
import { createViewport } from '../../../commons/src/viewport';
import {
  isDouble,
  locoTile,
  otherValue,
  ownTrain,
  parseTile,
  type GameState,
  type Move,
  type Player,
  type TrainId,
} from '../engine';
import { esc } from '../../../commons/src/html';
import { L } from './i18n';
import { layoutTable, TRAIN_X, type Slot, type TableLayout } from './layout';

/** Номер локомотива среди костей стола: он лежит в центре, вне поездов. */
export const LOCO_SEQ = -1;

const MIN_W = CELL * 5;
const MAX_W = CELL * 60;

/** Вместимость ряда поезда в клетках: на узком экране ряды короче. */
export function rowCellsFor(viewWidth: number): number {
  return viewWidth < 700 ? 10 : 18;
}

/**
 * Минимальная ширина кадра автоподгонки: в начале раунда стол видно
 * «издалека»; на узких экранах кадр ближе, иначе кости нечитаемо мелкие.
 */
function fitMinW(viewWidth: number): number {
  return viewWidth < 700 ? CELL * 11 : CELL * 18;
}

interface Ghost {
  readonly move: Move;
  readonly slot: Slot;
  readonly values: readonly [number, number];
}

/** Подпись поезда на столе: чей он, открыт ли, закончен ли. */
function trainLabel(state: GameState, id: TrainId, bottom: Player): string {
  const name =
    id === 'mx' ? L().tableMexican : id === ownTrain(bottom) ? L().tableYours : L().tableOpponent;
  const tiles = state.trains[id].tiles;
  if (tiles[tiles.length - 1]?.dead) return `${name} · ${L().tableDead}`;
  return id !== 'mx' && state.trains[id].open ? `${name} · ${L().tableOpen}` : name;
}

function ghostPips(value: number, cx: number): string {
  // Уменьшенные очки-намёки.
  const size = TILE_W;
  const r = size * 0.07;
  const area = size * 0.8;
  const off = (size - area) / 2 - size / 2;
  return PIPS[value]!
    .map(
      ([px, py]) =>
        `<circle cx="${(cx + off + px * area).toFixed(1)}" cy="${(off + py * area).toFixed(1)}"
             r="${r.toFixed(1)}" class="ghost-pip"/>`,
    )
    .join('');
}

/** Контур кости с очками: тень хода или место ещё не выставленного локомотива. */
function outlineSvg(slot: Slot, values: readonly [number, number], cls: string, attrs: string, title: string): string {
  return `
    <g transform="${placedTransform(slot.a, slot.b)}" class="${cls}" ${attrs}>
      <title>${esc(title)}</title>
      <rect x="${-TILE_L / 2}" y="${-TILE_W / 2}" width="${TILE_L}" height="${TILE_W}"
        rx="${TILE_R}" class="ghost-body"/>
      <line x1="0" y1="${-TILE_W / 2 + 7}" x2="0" y2="${TILE_W / 2 - 7}" class="ghost-divider"/>
      ${ghostPips(values[0], -CELL / 2)}
      ${ghostPips(values[1], CELL / 2)}
    </g>`;
}

export function createBoard(svg: SVGSVGElement, hooks: BoardHooks<Move>): BoardRenderer<GameState, Move> {
  let autoFit = true;
  let last: { state: GameState; opts: BoardRenderOptions<Move>; layout: TableLayout } | null = null;
  let ghosts: Ghost[] = [];

  const view = createViewport(svg, {
    initial: { x: -CELL * 2, y: -CELL * 3, w: CELL * 18, h: CELL * 10 },
    minW: MIN_W,
    maxW: MAX_W,
    // Нажатие на тень хода — работа с ходом, а не с камерой.
    holdSelector: '[data-move]',
    onGesture(kind) {
      // Щипок сообщает о каждом шаге — автомасштаб выключается на первом.
      if (kind === 'pinch' && !autoFit) return;
      autoFit = false;
      hooks.onViewChange(false);
    },
    onReset() {
      autoFit = true;
      fit();
      hooks.onViewChange(true);
    },
  });

  // Куча базара лежит поверх стола в правом нижнем углу, панель подсказки —
  // поверх его верха: автомасштаб не прячет под ними поезда. Элементы ищутся
  // один раз.
  let pileEl: Element | null = null;
  let tutorEl: HTMLElement | null = null;

  /** Сколько экранных px сверху стола занято панелью подсказки. */
  function topInset(rect: DOMRect): number {
    tutorEl ??= document.querySelector<HTMLElement>('#tutor-bar');
    if (!tutorEl || tutorEl.hidden || rect.height === 0) return 0;
    return Math.max(0, tutorEl.getBoundingClientRect().bottom - rect.top + 6);
  }

  function fit(animate = true): void {
    if (!last) return;
    pileEl ??= document.querySelector('#boneyard');
    const b = last.layout.bounds;
    const avoid = pileEl ? pileEl.getBoundingClientRect() : null;
    const frame = (extra: number): ReturnType<typeof view.frame> =>
      view.frame({ ...b, minY: b.minY - extra }, { unit: CELL, minW: fitMinW, avoid });
    const rect = svg.getBoundingClientRect();
    const inset = topInset(rect);
    let extra = 0;
    let box = frame(extra);
    // Верх содержимого опускается под панель подсказки: поле сверху растёт,
    // пока подпись верхнего поезда не выйдет из-под неё.
    for (let i = 0; i < 6 && inset > 0; i++) {
      const top = (((b.minY + 0.5) * CELL - box.y) / box.h) * rect.height;
      if (top >= inset) break;
      extra += ((inset - top) * box.h) / rect.height / CELL + 0.1;
      box = frame(extra);
    }
    view.set(box, animate);
  }

  // Кадр подгоняется после рендера всего экрана, а не посреди него: панель
  // подсказки каркас рисует после стола, и мерить её раньше бессмысленно.
  let fitQueued = false;
  let fitAnimate = true;
  function queueFit(animate: boolean): void {
    fitAnimate = animate;
    if (fitQueued) return;
    fitQueued = true;
    queueMicrotask(() => {
      fitQueued = false;
      if (autoFit) fit(fitAnimate);
    });
  }

  // Смена размера окна меняет вместимость рядов — стол раскладывается заново.
  window.addEventListener('resize', () => {
    if (last) render(last.state, last.opts);
  });

  svg.addEventListener('click', (ev) => {
    const el = (ev.target as Element).closest<SVGElement>('[data-move]');
    if (!el || view.dragged()) return;
    hooks.onMove(JSON.parse(el.dataset.move!) as Move);
  });

  function render(state: GameState, opts: BoardRenderOptions<Move>): void {
    const bottom: Player = opts.game?.flip ? 1 : 0;
    const rect = svg.getBoundingClientRect();
    const layout = layoutTable(state, { rowCells: rowCellsFor(rect.width || 1280), bottom });
    last = { state, opts, layout };
    const parts: string[] = [];
    // Последняя выложенная кость помечается кольцом — мгновенный ход (особенно
    // бота) легко пропустить.
    const lastSeq = state.seq - 1;
    const ring = `<rect class="last-ring" x="${-TILE_L / 2 - 3}" y="${-TILE_W / 2 - 3}"
                   width="${TILE_L + 6}" height="${TILE_W + 6}" rx="${TILE_R + 2.5}"/>`;

    // «Рельсы» от локомотива к началу каждого поезда.
    const hubY = ((layout.loco.a.y + layout.loco.b.y) / 2) * CELL;
    for (const t of layout.trains) {
      const y = t.top * CELL;
      parts.push(
        `<path class="rail" d="M ${0.5 * CELL} ${hubY} H ${CELL} V ${y} H ${(TRAIN_X - 0.5) * CELL}"/>`,
      );
    }

    // Локомотив: выставленный — лицом с золотой окантовкой; пока его ищут — контур.
    const loco = locoTile(state.loco);
    if (state.phase === 'loco') {
      parts.push(
        outlineSvg(layout.loco, [state.loco, state.loco], 'ghost loco-wait', '', L().tableLoco(loco.replace('-', ':'))),
      );
    } else {
      const flags = `${opts.animateSeq === LOCO_SEQ ? ' just-placed' : ''}${opts.hideSeq === LOCO_SEQ ? ' incoming' : ''}`;
      parts.push(
        `<g transform="${placedTransform(layout.loco.a, layout.loco.b)}" data-seq="${LOCO_SEQ}" class="placed loco${flags}">
          <title>${esc(L().tableLoco(loco.replace('-', ':')))}</title>${tileFace(state.loco, state.loco, {
            accent: true,
            shadow: 'tile',
          })}</g>`,
      );
    }

    // Поезда: подпись и кости.
    for (const t of layout.trains) {
      const train = state.trains[t.id];
      const cls = `train-label${t.id !== 'mx' && train.open ? ' open' : ''}`;
      parts.push(
        `<text class="${cls}" x="${(TRAIN_X - 0.45) * CELL}" y="${(t.top - 1.15) * CELL}">${esc(
          trainLabel(state, t.id, bottom),
        )}</text>`,
      );
      train.tiles.forEach((p, i) => {
        const slot = t.slots[i]!;
        const isLast = p.seq === lastSeq;
        const flags = `${p.dead ? ' dead-double' : ''}${isLast ? ' last-placed' : ''}${
          opts.hideSeq === p.seq ? ' incoming' : ''
        }`;
        // Мёртвый дубль лежит поперёк рубашкой вверх: поезд на нём закончен.
        const face = p.dead
          ? tileBack({ shadow: 'tile' })
          : tileFace(p.values[0], p.values[1], {
              shadow: 'tile',
              className: p.seq === opts.animateSeq ? 'just-placed' : '',
            });
        const pt = parseTile(p.tile);
        parts.push(
          `<g transform="${placedTransform(slot.a, slot.b)}" data-seq="${p.seq}" class="placed${flags}">
          <title>${pt.hi}:${pt.lo}${p.dead ? ` — ${esc(L().tableDead)}` : ''}</title>${face}${isLast ? ring : ''}</g>`,
        );
      });
    }

    // Тени ходов выбранной кости.
    ghosts = [];
    for (const m of opts.ghostMoves) {
      let slot: Slot;
      let values: readonly [number, number];
      if (m.type === 'loco') {
        slot = layout.loco;
        values = [state.loco, state.loco];
      } else if (m.type === 'place') {
        const t = layout.trains.find((x) => x.id === m.train)!;
        const inner = state.trains[m.train].end;
        slot = isDouble(m.tile) ? t.next.double : t.next.tile;
        values = [inner, otherValue(m.tile, inner)];
      } else {
        continue;
      }
      ghosts.push({ move: m, slot, values });
      const dataMove = opts.interactive ? `data-move='${JSON.stringify(m).replace(/'/g, '&#39;')}'` : '';
      const pending = opts.pending && sameMove(m, opts.pending) ? ' pending' : '';
      parts.push(outlineSvg(slot, values, `ghost${pending}`, dataMove, trainLabel(state, m.type === 'loco' ? 'mx' : m.train, bottom)));
    }

    svg.innerHTML = parts.join('\n');
    if (autoFit) queueFit(state.seq > 0);
  }

  /** Кость в клетках сцены — на экране; null, пока стол не свёрстан. */
  function screenPose(slot: Slot): ScreenPose | null {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const vb = view.get();
    const { cx, cy, angle } = tileCenterAngle(slot.a, slot.b);
    return {
      x: rect.left + ((cx - vb.x) / vb.w) * rect.width,
      y: rect.top + ((cy - vb.y) / vb.h) * rect.height,
      angle,
      scale: (TILE_L / vb.w) * rect.width,
    };
  }

  /** Место выложенной кости по её номеру. */
  function slotOf(seq: number): Slot | null {
    if (!last) return null;
    if (seq === LOCO_SEQ) return last.state.phase === 'loco' ? null : last.layout.loco;
    for (const t of last.layout.trains) {
      const i = last.state.trains[t.id].tiles.findIndex((p) => p.seq === seq);
      if (i >= 0) return t.slots[i]!;
    }
    return null;
  }

  function placedScreenPoint(seq: number): ScreenPose | null {
    const slot = slotOf(seq);
    return slot ? screenPose(slot) : null;
  }

  return {
    render,
    placedScreenPoint,
    /** Тени последнего рендера на экране; точка прилипания — центр тени. */
    ghostTargets(): GhostTarget<Move>[] {
      const out: GhostTarget<Move>[] = [];
      for (const g of ghosts) {
        const pose = screenPose(g.slot);
        if (!pose) return [];
        out.push({ move: g.move, x: pose.x, y: pose.y, pose, values: g.values });
      }
      return out;
    },
    /** Довести кость в кадр минимальным сдвигом (автомасштаб выключен). */
    ensureVisible(seq, margin = 40) {
      const pt = placedScreenPoint(seq);
      if (pt) view.reveal(pt, margin);
    },
    setAutoFit(on, animate = true) {
      autoFit = on;
      if (on) fit(animate);
    },
    isAutoFit: () => autoFit,
  };
}

/** Тот же ход по существу: вид, кость и поезд. */
export function sameMove(a: Move, b: Move): boolean {
  if (a.type === 'place' && b.type === 'place') return a.tile === b.tile && a.train === b.train;
  return a.type === b.type;
}
