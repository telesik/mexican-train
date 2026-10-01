// @vitest-environment jsdom
// Игровые виды для каркаса: тексты журнала, приглашения, подсказки, итоги
// раунда, проверка сейва.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_VARIANT,
  applyMove,
  finishRound,
  nextRound,
  startMatch,
  type GameState,
  type LogEntry,
  type MatchState,
  type Move,
  type RoundResult,
} from '../src/engine';
import { LOCO_SEQ } from '../src/ui/board';
import { createGame, rulesDocUrl, validateSaved } from '../src/ui/game';
import { setLocale } from '../src/ui/i18n';
import { DRAW, LOCO, PASS, makeState, place } from './helpers';

const { view, engine, board } = createGame();
const names = ['Аня', 'Бот'] as const;
const ctx = (legal: Move[], selected: string | null = null) => ({ legal, selected, nameHtml: '<b>Аня</b>' });

beforeEach(() => setLocale('ru'));

describe('игра для каркаса', () => {
  it('собрана из движка, стола и видов; своих полей старта и настроек нет', () => {
    expect(engine.id).toBe('mexican-train');
    expect(typeof board).toBe('function');
    expect(view.hotSeat).toBe(false);
    expect(view.pileSize).toBe(14);
    expect(view.startFields()).toBe('');
    expect(view.variantFrom({} as never)).toBe(BASE_VARIANT);
    expect(view.loadPrefs({})).toBeUndefined();
    expect(view.dumpPrefs()).toEqual({});
    expect(view.boardFlags!(0)).toEqual({ flip: false });
    expect(view.boardFlags!(1)).toEqual({ flip: true });
    expect(view.logo(20, 'x')).toContain('<svg');
    expect(view.titleHtml()).toContain('exican Train');
    expect(view.tileBack({})).toContain('<');
    expect(view.tutorOver(makeState({ hands: [[], []] }))).toContain('Раунд окончен');
  });

  it('полные правила: русский текст — русским, остальным — английский', () => {
    expect(rulesDocUrl()).toMatch(/docs\/RULES\.ru\.md$/);
    expect(view.rulesUrl()).toBe(rulesDocUrl());
    setLocale('de');
    expect(rulesDocUrl()).toMatch(/docs\/RULES\.en\.md$/);
  });

  it('слайды и вопрос обучения открываются оверлеем', () => {
    document.body.innerHTML = '<div id="overlay" hidden></div>';
    const onClose = vi.fn();
    view.openHowTo({ onClose });
    expect(document.body.textContent).toContain('Локомотив и три поезда');
    document.body.innerHTML = '<div id="overlay" hidden></div>';
    view.openHowToAsk({ onShow: () => undefined, onLater: () => undefined });
    expect(document.body.textContent).toContain('Показать, как играть?');
  });
});

describe('ходы глазами каркаса', () => {
  const s = makeState({ hands: [['6-6', '6-5'], ['4-1']], phase: 'loco' });

  it('вид хода, кость хода и номер кости на столе', () => {
    expect(view.moveKind(LOCO)).toBe('place');
    expect(view.moveKind(place('6-5', 'p0'))).toBe('place');
    expect(view.moveKind(DRAW)).toBe('draw');
    expect(view.moveKind(PASS)).toBe('pass');
    expect(view.moveTile(LOCO, s)).toBe('6-6');
    expect(view.moveTile(place('6-5', 'p0'), s)).toBe('6-5');
    expect(view.moveTile(DRAW, s)).toBeNull();
    const after = applyMove(applyMove(s, LOCO), place('6-5', 'p0'));
    expect(view.placedSeqOf(LOCO, after)).toBe(LOCO_SEQ);
    expect(view.placedSeqOf(place('6-5', 'p0'), after)).toBe(after.seq - 1);
    expect(view.placedSeqOf(DRAW, after)).toBeNull();
    expect(view.placedValues(after, 0)).toEqual([6, 5]);
    expect(view.placedValues(after, LOCO_SEQ)).toEqual([6, 6]);
    expect(view.placedValues(after, 42)).toEqual([6, 6]);
  });

  it('звук: локомотив — акцент, дубль — тяжёлый, прочее — обычный', () => {
    expect(view.placeSound(LOCO, s)).toBe('accent');
    expect(view.placeSound(place('5-5', 'p0'), s)).toBe('heavy');
    expect(view.placeSound(place('6-5', 'p0'), s)).toBe('normal');
    expect(view.placeSound(DRAW, s)).toBe('normal');
    expect(view.samePlacement(LOCO, LOCO)).toBe(true);
  });

  it('тени: ходы выбранной кости; локомотив — только дублем раунда', () => {
    const legal = [place('6-5', 'p0'), place('6-5', 'mx'), place('6-4', 'p0')];
    expect(view.ghostMoves(s, legal, '6-5')).toEqual(legal.slice(0, 2));
    expect(view.ghostMoves(s, [LOCO], '6-6')).toEqual([LOCO]);
    expect(view.ghostMoves(s, [LOCO], '6-5')).toEqual([]);
    expect(view.ghostMoves(s, [DRAW], '6-5')).toEqual([]);
  });

  it('вытянутая кость: обязательная к ходу, подсказка о ней и кость последнего добора', () => {
    const forced = makeState({ hands: [['6-5'], ['4-1']], mustPlay: '6-5' });
    expect(view.forcedTile(forced)).toBe('6-5');
    expect(view.forcedToast(forced)).toBe('Обязаны сходить вытянутой костью 6:5');
    expect(view.forcedTile(s)).toBeNull();
    // Добор, не подошедший ни к чему: за записью о доборе идёт запись об открытом поезде.
    const start = makeState({ hands: [['2-1'], ['4-1']], boneyard: ['3-3', '1-0'] });
    const drawn = applyMove(start, DRAW);
    expect(drawn.log.at(-1)!.kind).toBe('open');
    expect(view.drawnTile(drawn)).toBe(drawn.hands[0].find((t) => t !== '2-1'));
    expect(view.drawnTile(start)).toBeNull();
    // История кончается добором, а записи о нём нет — кости нет.
    expect(view.drawnTile({ ...drawn, log: [] })).toBeNull();
    expect(view.refitOnPick!(s)).toBe(true);
    expect(view.refitOnPick!(forced)).toBe(false);
  });
});

describe('журнал', () => {
  const line = (e: LogEntry): string => view.describeLog(e, names, 0);

  it('каждая запись — строкой; вытянутую кость журнал не называет', () => {
    expect(line({ kind: 'loco', player: 0, tile: '6-6' })).toBe('Аня: локомотив 6:6');
    expect(line({ kind: 'place', player: 0, tile: '6-5', train: 'p0', covers: false })).toBe('Аня: 6:5 — поезд игрока Аня');
    expect(line({ kind: 'place', player: 1, tile: '6-4', train: 'mx', covers: false })).toBe('Бот: 6:4 — мексиканский поезд');
    expect(line({ kind: 'place', player: 1, tile: '5-4', train: 'p1', covers: true })).toBe('Бот: 5:4 — дубль закрыт');
    expect(line({ kind: 'draw', player: 0, tile: '3-1', playable: false, lacks: [5] })).toBe('Аня: кость из базара — в руку, ход дальше');
    expect(line({ kind: 'draw', player: 0, tile: '3-1', playable: true, lacks: [] })).toBe('Аня: кость из базара — подходит!');
    expect(line({ kind: 'pass', player: 1, lacks: [5] })).toBe('Бот: пас');
    expect(line({ kind: 'dead', train: 'p1' })).toBe('Мёртвый дубль — поезд игрока Бот закончен');
    expect(line({ kind: 'open', train: 'p0' })).toBe('Открыт поезд игрока Аня');
    expect(line({ kind: 'close', train: 'p1' })).toBe('Закрыт поезд игрока Бот');
    expect(line({ kind: 'end', cause: 'out' })).toBe('Выход!');
    expect(line({ kind: 'end', cause: 'blocked' })).toBe('Рыба!');
  });

  it('место записи: у записей игрока — он сам, у событий стола — никто', () => {
    expect(view.logSeat({ kind: 'pass', player: 1, lacks: [] })).toBe(1);
    expect(view.logSeat({ kind: 'open', train: 'p0' })).toBeNull();
  });
});

describe('приглашение к ходу и подсказки', () => {
  const loco = makeState({ hands: [['6-6'], ['4-1']], phase: 'loco' });
  const main = makeState({ hands: [['6-5'], ['4-1']] });
  const must = makeState({ hands: [['6-5'], ['4-1']], mustPlay: '6-5' });
  const dbl = makeState({ hands: [['5-4'], ['4-1']], openDouble: { train: 'p0', value: 5, by: 1 } });

  it('приглашение: локомотив, добор, обязательная кость, дубль, обычный ход, пас', () => {
    expect(view.prompt(loco, ctx([LOCO]))).toBe('<b>Аня</b>: выставьте локомотив 6:6');
    expect(view.prompt(loco, ctx([DRAW]))).toBe('<b>Аня</b>: локомотива 6:6 на руке нет — возьмите кость из базара');
    expect(view.prompt(must, ctx([place('6-5', 'p0')]))).toBe('<b>Аня</b>: кость 6:5 подходит — обязаны сходить ею');
    expect(view.prompt(main, ctx([PASS]))).toBe('<b>Аня</b>: сходить нечем, базар пуст — пас');
    expect(view.prompt(dbl, ctx([place('5-4', 'p0')]))).toBe('<b>Аня</b>: закройте дубль — нужна кость с числом 5');
    expect(view.prompt(dbl, ctx([DRAW]))).toBe('<b>Аня</b>: закрыть дубль нечем — возьмите кость из базара');
    expect(view.prompt(main, ctx([place('6-5', 'p0')]))).toBe('<b>Аня</b>: ваш ход — выберите кость и место');
    expect(view.prompt(main, ctx([DRAW]))).toBe('<b>Аня</b>: сходить нечем — возьмите кость из базара');
  });

  it('подсказка обучения: по фазе, виду хода и выбранной кости', () => {
    expect(view.tutor(loco, ctx([LOCO]))).toContain('Раунд открывает локомотив');
    expect(view.tutor(loco, ctx([DRAW]))).toContain('Локомотива на руке нет');
    expect(view.tutor(main, ctx([DRAW]))).toContain('кликните кучу базара');
    expect(view.tutor(main, ctx([PASS]))).toContain('базар пуст');
    expect(view.tutor(must, ctx([place('6-5', 'p0')]))).toContain('обязаны сходить именно ею');
    expect(view.tutor(dbl, ctx([place('5-4', 'p0')]))).toContain('Дубль стоит поперёк');
    expect(view.tutor(main, ctx([place('6-5', 'p0')]))).toContain('Кликните светлую кость');
    expect(view.tutor(main, ctx([place('6-5', 'p0')], '6-5'))).toContain('Кликните тень');
  });

  it('вопрос подтверждения называет поезд глазами ходящего', () => {
    expect(view.confirmQuestion(LOCO, loco)).toBe('Выставить локомотив 6:6?');
    expect(view.confirmQuestion(place('6-5', 'p0'), main)).toBe('Поставить 6:5 — ваш поезд?');
    expect(view.confirmQuestion(place('6-5', 'p1'), main)).toBe('Поставить 6:5 — поезд соперника?');
    expect(view.confirmQuestion(place('6-5', 'mx'), main)).toBe('Поставить 6:5 — мексиканский поезд?');
    expect(view.confirmQuestion(place('6-5', 'p1'), { ...main, current: 1 })).toBe('Поставить 6:5 — ваш поезд?');
    expect(view.confirmQuestion(DRAW, main)).toBe('');
  });
});

describe('руки и итоги', () => {
  const nameOf = (p: 0 | 1): string => (p === 0 ? 'Аня <1>' : 'Бот');

  /** Матч, первый раунд которого закончен с заданными руками и итогом. */
  function finished(hands: [string[], string[]], result: RoundResult, rounds = 1): MatchState {
    let match = startMatch({ names: ['Аня <1>', 'Бот'], first: 0, variant: BASE_VARIANT, seed: 1 });
    for (let i = 0; i < rounds; i++) {
      if (i > 0) match = nextRound(match, 10 + i);
      const round: GameState = { ...match.round, phase: 'over', hands: i === rounds - 1 ? hands : match.round.hands, result };
      match = finishRound({ ...match, round });
    }
    return match;
  }

  it('рука соперника закрыта всегда; подпись руки — кости и очки своей, только кости чужой', () => {
    const s = makeState({ hands: [['6-5', '2-1'], ['4-1']] });
    expect(view.handHidden(s, 1, 0)).toBe(true);
    expect(view.handHidden(s, 0, 0)).toBe(false);
    expect(view.handHidden(s, 0, 1)).toBe(true);
    expect(view.handMeta(s, 0, false)).toBe('2 кости · 14 очк.');
    expect(view.handMeta(s, 1, true)).toBe('1 кость');
  });

  it('бейдж счёта матча и подпись раунда в истории', () => {
    const m = finished([[], ['4-1']], { cause: 'out', sums: [0, 5], added: [0, 5], winner: 0 });
    expect(view.totalChip(m, 1)).toContain('>5</span>');
    expect(view.totalChip(m, 1)).toContain('data-tip=');
    expect(view.roundSummary(m.rounds[0]!, 0)).toBe('Раунд 1 — выход, 0:5');
    expect(view.roundSummary({ cause: 'blocked', sums: [3, 3], added: [3, 3], winner: null }, 2)).toBe('Раунд 3 — рыба, 3:3');
  });

  it('итоги раунда с выходом: кто вышел, руки, очки, кто начинает следующий', () => {
    const m = finished([[], ['4-1']], { cause: 'out', sums: [0, 5], added: [0, 5], winner: 0 });
    const v = view.roundOver(m, nameOf);
    expect(v.title).toBe('Выход: Аня &lt;1&gt;!');
    expect(v.sub).toBe('Последняя кость выставлена — рука пуста.');
    expect(v.rows).toContain('рука пуста');
    expect(v.rows).toContain('<span class="plus">+5</span>');
    expect(v.rows).toContain('<span class="zero">+0</span>');
    expect(v.matchLabel).toBe('Раунд 1 из 7');
    expect(v.outcomeTitle).toBeNull();
    expect(v.nextNote).toBe('Следующий раунд начинает Аня &lt;1&gt; — победитель раунда.');
    // Вышел второй игрок.
    const m2 = finished([['0-0'], []], { cause: 'out', sums: [25, 0], added: [25, 0], winner: 1 });
    const v2 = view.roundOver(m2, nameOf);
    expect(v2.title).toBe('Выход: Бот!');
    expect(v2.rows).toContain('0:0 последней костью на руке — 25 очков.');
  });

  it('рыба поровну: победителя нет, очередь переходит', () => {
    const m = finished([['2-1'], ['3-0']], { cause: 'blocked', sums: [3, 3], added: [3, 3], winner: null });
    const v = view.roundOver(m, nameOf);
    expect(v.title).toBe('Рыба!');
    expect(v.sub).toBe('Кость не может поставить никто. Считаем очки. Суммы равны — победителя раунда нет.');
    expect(v.nextNote).toBe('Следующий раунд начинает Бот — после раунда без победителя очередь переходит.');
  });

  it('седьмой раунд: исход матча — победа меньшей суммы или ничья', () => {
    const win = finished([[], ['4-1']], { cause: 'out', sums: [0, 5], added: [0, 5], winner: 0 }, 7);
    const v = view.roundOver(win, nameOf);
    expect(v.matchLabel).toBe('Раунд 7 из 7');
    expect(v.outcomeTitle).toBe('Победа в матче: Аня &lt;1&gt;!');
    expect(v.nextNote).toBe('');
    const draw = finished([['2-1'], ['3-0']], { cause: 'blocked', sums: [3, 3], added: [3, 3], winner: null }, 7);
    expect(view.roundOver(draw, nameOf).outcomeTitle).toBe('Ничья в матче — счёты равны');
  });
});

describe('проверка сейва', () => {
  const good = (): MatchState =>
    startMatch({ names: ['А', 'Б'], first: 0, variant: BASE_VARIANT, seed: 3, bot: { player: 1, level: 'normal' } });
  const json = (m: unknown): unknown => JSON.parse(JSON.stringify(m));
  const broken = (patch: (m: any) => void): unknown => {
    const m = json(good());
    patch(m);
    return m;
  };

  it('годный сейв возвращается как есть — с ботом, без бота и с костями на столе', () => {
    const m = json(good());
    expect(validateSaved(m)).toBe(m);
    expect(view.validateSaved(m)).toBe(m);
    expect(validateSaved(broken((x) => (x.bot = null)))).not.toBeNull();
    let round = good().round;
    for (let i = 0; i < 12 && round.phase !== 'over'; i++) round = applyMove(round, engine.legalMoves(round)[0]!);
    expect(validateSaved(json({ ...good(), round }))).not.toBeNull();
  });

  it('негодный сейв — null', () => {
    const cases: Array<(m: any) => void> = [
      (m) => (m.names = ['А']),
      (m) => (m.names = ['А', 1]),
      (m) => (m.totals = [0]),
      (m) => (m.totals = [0, 'x']),
      (m) => (m.rounds = null),
      (m) => (m.rounds = new Array(8).fill({})),
      (m) => (m.round = null),
      (m) => (m.round.phase = 'draw'),
      (m) => (m.round.round = 1.5),
      (m) => (m.round.round = -1),
      (m) => (m.round.round = 7),
      (m) => (m.round.loco = 0),
      (m) => (m.round.hands = [[]]),
      (m) => (m.round.hands[0] = ['7-7']),
      (m) => (m.round.hands[1] = 'x'),
      (m) => (m.round.boneyard = [5]),
      (m) => (m.round.trains = null),
      (m) => (m.round.trains.p0 = null),
      (m) => (m.round.trains.p1.tiles = 'x'),
      (m) => (m.round.trains.mx.tiles = [null]),
      (m) => (m.round.trains.mx.tiles = [{ tile: 5, seq: 0 }]),
      (m) => (m.round.trains.mx.tiles = [{ tile: '9-9', seq: 0 }]),
      (m) => (m.round.trains.mx.tiles = [{ tile: '6-5', seq: 'a' }]),
      (m) => (m.round.trains.mx.end = 'x'),
      (m) => (m.round.trains.mx.open = 1),
      (m) => (m.round.current = 2),
      (m) => (m.round.seed = 'x'),
      (m) => (m.round.seq = 0.5),
      (m) => (m.round.history = null),
      (m) => (m.round.log = null),
      (m) => (m.bot = { player: 2, level: 'normal' }),
      (m) => (m.bot = { player: 1, level: 'hard' }),
    ];
    cases.forEach((patch, i) => expect(validateSaved(broken(patch)), `случай ${i}`).toBeNull());
    expect(validateSaved(undefined)).toBeNull();
    expect(validateSaved({})).toBeNull();
  });
});
