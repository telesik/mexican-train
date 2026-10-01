// @vitest-environment jsdom
// Стол: локомотив, поезда, тени ходов, клики и кадр. jsdom геометрии не
// считает — прямоугольник стола подменяется.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMove, type GameState, type Move } from '../src/engine';
import { createBoard, LOCO_SEQ, rowCellsFor, sameMove } from '../src/ui/board';
import { setLocale } from '../src/ui/i18n';
import { installDomStubs, rectOf, settle } from './dom-helpers';
import { LOCO, makeState, place } from './helpers';

const SVG_NS = 'http://www.w3.org/2000/svg';
let svg: SVGSVGElement;
let moves: Move[];
let views: boolean[];

function board(): ReturnType<typeof createBoard> {
  return createBoard(svg, { onMove: (m) => moves.push(m), onViewChange: (auto) => views.push(auto) });
}
const opts = { ghostMoves: [] as Move[], selected: null, animateSeq: null, interactive: true };
const viewBox = (): number[] => svg.getAttribute('viewBox')!.split(' ').map(Number);
const texts = (sel: string): string[] => [...svg.querySelectorAll(sel)].map((e) => e.textContent ?? '');

/** Раунд с выставленным локомотивом 6:6 и ходом игрока 0. */
function started(): GameState {
  return applyMove(makeState({ hands: [['6-6', '6-5', '5-5', '5-2'], ['6-4', '4-1']], phase: 'loco', boneyard: ['3-3'] }), LOCO);
}

beforeEach(() => {
  installDomStubs();
  setLocale('ru');
  document.body.innerHTML = '<div id="boneyard"></div><div id="tutor-bar" hidden></div>';
  svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  svg.getBoundingClientRect = () => rectOf(0, 0, 800, 450);
  moves = [];
  views = [];
});
afterEach(() => vi.restoreAllMocks());

describe('стол: отрисовка', () => {
  it('ширина экрана задаёт вместимость ряда', () => {
    expect(rowCellsFor(375)).toBe(10);
    expect(rowCellsFor(1280)).toBe(18);
  });

  it('пока локомотив ищут — на его месте контур с очками дубля раунда; поезда подписаны', () => {
    const b = board();
    b.render(makeState({ hands: [['6-6'], ['1-0']], phase: 'loco' }), opts);
    expect(svg.querySelectorAll('.ghost.loco-wait')).toHaveLength(1);
    expect(svg.querySelector('.loco-wait title')!.textContent).toBe('локомотив 6:6');
    expect(svg.querySelectorAll('.loco-wait .ghost-pip')).toHaveLength(12);
    expect(svg.querySelector('.placed')).toBeNull();
    expect(texts('.train-label')).toEqual(['поезд соперника', 'мексиканский поезд', 'ваш поезд']);
    expect(svg.querySelectorAll('.rail')).toHaveLength(3);
    expect(b.placedScreenPoint(LOCO_SEQ)).toBeNull();
  });

  it('выставленный локомотив и кости поездов; последняя — с кольцом; дубль лежит поперёк', () => {
    const b = board();
    let s = started();
    b.render(s, { ...opts, animateSeq: LOCO_SEQ, hideSeq: LOCO_SEQ });
    const loco = svg.querySelector('.placed.loco')!;
    expect(loco.getAttribute('data-seq')).toBe('-1');
    expect(loco.classList.contains('just-placed')).toBe(true);
    expect(loco.classList.contains('incoming')).toBe(true);
    s = applyMove(s, place('6-5', 'p0'));
    s = applyMove(s, place('6-4', 'p1'));
    s = applyMove(s, place('5-5', 'p0'));
    b.render(s, { ...opts, animateSeq: 2, hideSeq: 2 });
    expect(svg.querySelectorAll('.placed:not(.loco)')).toHaveLength(3);
    const last = svg.querySelector('.placed[data-seq="2"]')!;
    expect(last.classList.contains('last-placed')).toBe(true);
    expect(last.classList.contains('incoming')).toBe(true);
    expect(last.querySelector('.last-ring')).not.toBeNull();
    expect(last.querySelector('.just-placed')).not.toBeNull();
    // Дубль поперёк: повёрнут на четверть оборота.
    expect(last.getAttribute('transform')).toContain('rotate(90.0)');
    expect(svg.querySelector('.placed[data-seq="0"] .last-ring')).toBeNull();
  });

  it('открытый поезд подписан золотом; мёртвый дубль лежит рубашкой вверх', () => {
    const b = board();
    const s = makeState({
      hands: [['1-0'], ['2-0']],
      trains: { p0: { tiles: ['6-5'], end: 5, open: true }, p1: { tiles: ['6-3', '3-3'], end: 3 } },
    });
    // Последняя кость поезда соперника — мёртвый дубль.
    const dead: GameState = {
      ...s,
      seq: 3,
      trains: { ...s.trains, p1: { ...s.trains.p1, tiles: s.trains.p1.tiles.map((p, i) => (i === 1 ? { ...p, dead: true as const, seq: 2 } : p)) } },
    };
    b.render(dead, opts);
    expect(texts('.train-label')).toEqual([
      'поезд соперника · мёртвый дубль — поезд закончен',
      'мексиканский поезд',
      'ваш поезд · открыт',
    ]);
    expect(svg.querySelectorAll('.train-label.open')).toHaveLength(1);
    const dd = svg.querySelector('.placed.dead-double')!;
    expect(dd.querySelector('.tile-back')).not.toBeNull();
    expect(dd.querySelector('title')!.textContent).toBe('3:3 — мёртвый дубль — поезд закончен');
  });

  it('место внизу экрана определяет, чей поезд нижний', () => {
    const b = board();
    const s = makeState({ hands: [['1-0'], ['2-0']], trains: { p1: { open: true } } });
    b.render(s, { ...opts, game: { flip: true } });
    expect(texts('.train-label')).toEqual(['поезд соперника', 'мексиканский поезд', 'ваш поезд · открыт']);
  });
});

describe('стол: тени и клики', () => {
  it('тени ходов выбранной кости: по одной на поезд, клик отдаёт ход', () => {
    const b = board();
    const s = started();
    const ghosts = [place('6-5', 'p0'), place('6-5', 'mx')];
    b.render(s, { ...opts, ghostMoves: ghosts, selected: '6-5', pending: ghosts[1] });
    const els = [...svg.querySelectorAll<SVGElement>('.ghost:not(.loco-wait)')];
    expect(els).toHaveLength(2);
    expect(els.map((e) => e.classList.contains('pending'))).toEqual([false, true]);
    expect(els[0]!.querySelector('title')!.textContent).toBe('ваш поезд');
    els[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(moves).toEqual([ghosts[0]]);
    // Клик мимо тени — не ход.
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(moves).toHaveLength(1);
  });

  it('тень локомотива — на его месте; ходы без кости теней не дают; вне игры тени не кликаются', () => {
    const b = board();
    const s = makeState({ hands: [['6-6'], ['1-0']], phase: 'loco' });
    b.render(s, { ...opts, ghostMoves: [LOCO, { type: 'draw' }], selected: '6-6', interactive: false });
    const ghost = svg.querySelector<SVGElement>('.ghost:not(.loco-wait)')!;
    expect(svg.querySelectorAll('.ghost:not(.loco-wait)')).toHaveLength(1);
    expect(ghost.hasAttribute('data-move')).toBe(false);
    expect(b.ghostTargets()).toHaveLength(1);
    expect(b.ghostTargets()[0]!.values).toEqual([6, 6]);
  });

  it('тень дубля лежит поперёк; тень обычной кости — числом поезда к поезду', () => {
    const b = board();
    const s = applyMove(started(), place('6-5', 'p0'));
    // Ход игрока 1; смотрим тени для костей игрока 0 как таковые.
    b.render(s, { ...opts, ghostMoves: [place('5-5', 'p0'), place('5-2', 'p0')], selected: '5-5' });
    const [dbl, tile] = b.ghostTargets();
    expect(dbl!.pose.angle).toBe(90);
    expect(tile!.pose.angle).toBe(0);
    expect(tile!.values).toEqual([5, 2]);
    expect(dbl!.x).toBe(dbl!.pose.x);
  });

  it('после драга клик по тени не считается ходом', () => {
    const b = board();
    const g = [place('6-5', 'p0')];
    b.render(started(), { ...opts, ghostMoves: g, selected: '6-5' });
    const pointer = (type: string, x: number, y: number): void =>
      void svg.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true }));
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 200, 200);
    pointer('pointerup', 200, 200);
    expect(views).toEqual([false]);
    expect(b.isAutoFit()).toBe(false);
    svg.querySelector('.ghost[data-move]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(moves).toEqual([]);
  });

  it('совпадение ходов: вид, кость и поезд', () => {
    expect(sameMove(place('6-5', 'p0'), place('6-5', 'p0'))).toBe(true);
    expect(sameMove(place('6-5', 'p0'), place('6-5', 'mx'))).toBe(false);
    expect(sameMove(LOCO, LOCO)).toBe(true);
    expect(sameMove(LOCO, { type: 'draw' })).toBe(false);
  });
});

describe('стол: кадр', () => {
  it('автомасштаб подгоняет кадр после рендера; щипок и колесо выключают его, двойной клик возвращает', async () => {
    const b = board();
    const before = viewBox();
    b.render(started(), opts);
    expect(viewBox()).toEqual(before);
    await settle();
    expect(viewBox()).not.toEqual(before);
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 400, clientY: 200, bubbles: true, cancelable: true }));
    expect(views).toEqual([false]);
    const pointer = (type: string, id: number, x: number, y: number): void =>
      void svg.dispatchEvent(new PointerEvent(type, { pointerId: id, button: 0, clientX: x, clientY: y, bubbles: true }));
    pointer('pointerdown', 1, 300, 200);
    pointer('pointerdown', 2, 500, 200);
    pointer('pointermove', 2, 600, 200);
    // Автомасштаб уже выключен — щипок повторно о нём не сообщает.
    expect(views).toEqual([false]);
    pointer('pointerup', 2, 600, 200);
    pointer('pointerup', 1, 300, 200);
    svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(views).toEqual([false, true]);
    expect(b.isAutoFit()).toBe(true);
    // Щипок при включённом автомасштабе выключает его.
    pointer('pointerdown', 1, 300, 200);
    pointer('pointerdown', 2, 500, 200);
    pointer('pointermove', 2, 600, 200);
    expect(views).toEqual([false, true, false]);
  });

  it('автомасштаб выключен — рендер кадр не трогает; включение подгоняет сразу', async () => {
    const b = board();
    b.setAutoFit(false);
    const before = viewBox();
    b.render(started(), opts);
    await settle();
    expect(viewBox()).toEqual(before);
    b.setAutoFit(true, false);
    expect(viewBox()).not.toEqual(before);
    // До первого рендера подгонять нечего и костей на столе нет.
    const fresh = createBoard(document.createElementNS(SVG_NS, 'svg'), { onMove: () => undefined, onViewChange: () => undefined });
    expect(() => fresh.setAutoFit(true)).not.toThrow();
    expect(fresh.placedScreenPoint(0)).toBeNull();
  });

  it('подгонка, отложенная на конец рендера, не срабатывает, если автомасштаб успели выключить', async () => {
    const b = board();
    b.render(started(), opts);
    b.render(started(), opts);
    const before = viewBox();
    b.setAutoFit(false);
    await settle();
    expect(viewBox()).toEqual(before);
  });

  it('панель подсказки поверх стола: кадр опускает поезда под неё', async () => {
    const b = board();
    b.render(started(), opts);
    await settle();
    const plain = viewBox();
    const bar = document.querySelector<HTMLElement>('#tutor-bar')!;
    bar.hidden = false;
    bar.getBoundingClientRect = () => rectOf(0, 0, 800, 120);
    b.setAutoFit(true, false);
    const lowered = viewBox();
    // Кадр вырос вверх: верх содержимого оказался ниже на экране.
    expect(lowered[1]).toBeLessThan(plain[1]!);
    // Панель над столом (не перекрывает его) кадр не меняет.
    bar.getBoundingClientRect = () => rectOf(0, -200, 800, 100);
    b.setAutoFit(true, false);
    expect(viewBox()).toEqual(plain);
  });

  it('кость на экране и довод её в кадр; стол не свёрстан — позы нет', async () => {
    const b = board();
    const s = applyMove(started(), place('6-5', 'p0'));
    b.render(s, { ...opts, ghostMoves: [place('6-4', 'p1')], selected: '6-4' });
    await settle();
    const pose = b.placedScreenPoint(0)!;
    expect(pose.angle).toBe(0);
    expect(pose.scale).toBeGreaterThan(0);
    expect(b.placedScreenPoint(LOCO_SEQ)!.angle).toBe(90);
    expect(b.placedScreenPoint(99)).toBeNull();
    // Кость в кадре — довод не нужен; за краем — кадр плавно сдвигается.
    b.setAutoFit(false);
    const before = viewBox();
    b.ensureVisible(0);
    expect(viewBox()).toEqual(before);
    b.ensureVisible(99);
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    b.ensureVisible(0, 2000);
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    expect(viewBox()).not.toEqual(before);
    svg.getBoundingClientRect = () => rectOf(0, 0, 0, 0);
    expect(b.placedScreenPoint(0)).toBeNull();
    expect(b.ghostTargets()).toEqual([]);
  });

  it('смена размера окна раскладывает стол заново', () => {
    const b = board();
    window.dispatchEvent(new Event('resize'));
    const s = makeState({ hands: [[], []], trains: { p0: { tiles: ['6-5', '5-4', '4-3', '3-2', '2-1', '1-0'], end: 0 } } });
    b.render(s, opts);
    const wide = svg.querySelector('.placed[data-seq="5"]')!.getAttribute('transform');
    svg.getBoundingClientRect = () => rectOf(0, 0, 375, 500);
    window.dispatchEvent(new Event('resize'));
    // На узком экране ряд короче — шестая кость ушла на поворот.
    expect(svg.querySelector('.placed[data-seq="5"]')!.getAttribute('transform')).not.toBe(wide);
  });

  it('без кучи базара и панели подсказки в документе стол работает', async () => {
    document.body.innerHTML = '';
    svg = document.createElementNS(SVG_NS, 'svg');
    document.body.appendChild(svg);
    const b = board();
    b.render(started(), opts);
    await settle();
    expect(svg.querySelectorAll('.placed')).toHaveLength(1);
  });
});
