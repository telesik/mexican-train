// «Мексиканский поезд» для каркаса приложения: игровые виды и тексты, стол
// трёх поездов. Экраны, руки, базар, историю и настройки ведёт общий каркас
// (подмодуль commons/, telesik-web-commons) — игру он знает через движок,
// стол и этот модуль.

import { esc } from '../../../commons/src/html';
import type { BoardFactory, GameView, RoundOverView, TurnCtx } from '../../../commons/src/shell/types';
import { tileBack, tileFace, tileSvgElement } from '../../../commons/src/tile-svg';
import {
  BASE_VARIANT,
  ROUNDS,
  handSum,
  isDouble,
  locoTile,
  mexicanTrainEngine,
  ownTrain,
  parseTile,
  type GameState,
  type LogEntry,
  type MatchOutcome,
  type MatchState,
  type Move,
  type Player,
  type RoundResult,
  type TileId,
  type TrainId,
  type Variant,
} from '../engine';
import { createBoard, LOCO_SEQ, sameMove } from './board';
import { openHowTo, openHowToAsk } from './howto';
import { getLocale, L } from './i18n';
import { logoSvg } from './logo';

/** Полный текст правил: русский и английский; остальным языкам — английский. */
export function rulesDocUrl(): string {
  const lang = getLocale() === 'ru' ? 'ru' : 'en';
  return `https://github.com/telesik/mexican-train/blob/main/docs/RULES.${lang}.md`;
}

type View = GameView<GameState, Move, Variant, RoundResult, LogEntry, MatchOutcome>;

export interface MexicanTrainGame {
  readonly engine: typeof mexicanTrainEngine;
  readonly view: View;
  readonly board: BoardFactory<GameState, Move>;
}

const tileLabel = (t: TileId): string => t.replace('-', ':');

/** Имя поезда в журнале: чей он — по имени игрока. */
function trainName(id: TrainId, names: readonly [string, string]): string {
  return id === 'mx' ? L().trainMexican : L().trainOf(names[id === 'p0' ? 0 : 1]);
}

/** Поезд в вопросе подтверждения: глазами того, кто ходит. */
function trainForMover(id: TrainId, mover: Player): string {
  return id === 'mx' ? L().tableMexican : id === ownTrain(mover) ? L().tableYours : L().tableOpponent;
}

// Формулировки без глаголов прошедшего времени: имена игроков любого рода.
// Вытянутую кость журнал не называет никому: рука соперника закрыта.
function describeLog(e: LogEntry, names: readonly [string, string]): string {
  switch (e.kind) {
    case 'loco':
      return L().logLoco(names[e.player], tileLabel(e.tile));
    case 'place':
      return e.covers
        ? L().logCover(names[e.player], tileLabel(e.tile))
        : L().logPlace(names[e.player], tileLabel(e.tile), trainName(e.train, names));
    case 'draw':
      return e.playable ? L().logDrawFits(names[e.player]) : L().logDraw(names[e.player]);
    case 'pass':
      return L().logPass(names[e.player]);
    case 'dead':
      return L().logDead(trainName(e.train, names));
    case 'open':
      return L().logOpen(trainName(e.train, names));
    case 'close':
      return L().logClose(trainName(e.train, names));
    case 'end':
      return e.cause === 'out' ? L().logOut : L().logBlocked;
  }
}

/** Приглашение к ходу в свой ход за этим экраном. */
function prompt(round: GameState, ctx: TurnCtx<Move>): string {
  const name = ctx.nameHtml;
  const first = ctx.legal[0]!;
  if (round.phase === 'loco') {
    const loco = tileLabel(locoTile(round.loco));
    return first.type === 'loco' ? L().promptLoco(name, loco) : L().promptLocoDraw(name, loco);
  }
  if (round.mustPlay) return L().promptMustPlay(name, tileLabel(round.mustPlay));
  if (first.type === 'pass') return L().promptPass(name);
  if (round.openDouble) {
    return first.type === 'place'
      ? L().promptCover(name, round.openDouble.value)
      : L().promptCoverDraw(name);
  }
  return first.type === 'place' ? L().promptYourMove(name) : L().promptDraw(name);
}

/** Подсказка режима обучения в свой ход: что сейчас можно сделать и как. */
function tutor(round: GameState, ctx: TurnCtx<Move>): string {
  const first = ctx.legal[0]!;
  if (round.phase === 'loco') return first.type === 'loco' ? L().tutorLoco : L().tutorLocoDraw;
  if (first.type === 'draw') return L().tutorDraw;
  if (first.type === 'pass') return L().tutorPass;
  if (round.mustPlay) return L().tutorMustPlay;
  if (round.openDouble) return L().tutorCover;
  return ctx.selected ? L().tutorPlace : L().tutorPick;
}

/** Кости руки лицом — для карточки итогов. */
function handTiles(hand: readonly TileId[]): string {
  return hand
    .map((t) => {
      const pt = parseTile(t);
      return tileSvgElement(tileFace(pt.hi, pt.lo, { shadow: 'flat' }), 52);
    })
    .join('');
}

/** Содержимое карточки итогов раунда: причина, руки, очки, исход матча. */
function roundOver(match: MatchState, nameOf: (seat: Player) => string): RoundOverView {
  const round = match.round;
  const result = round.result!;
  const lastRound = match.rounds[match.rounds.length - 1]!;
  // Вышел тот, у кого рука пуста (победитель по очкам может оказаться другим
  // только при равенстве — тогда победителя нет вовсе).
  const outPlayer: Player = round.hands[0].length === 0 ? 0 : 1;
  const rows = ([0, 1] as const)
    .map((p) => {
      const hand = round.hands[p];
      const zeroZero = hand.length === 1 && hand[0] === '0-0';
      const added = result.added[p];
      return `
          <div class="result-name">${esc(nameOf(p))}</div>
          <div class="result-pts"><b>${result.sums[p]}</b> ${L().ptsShort} ·
            ${added > 0 ? `<span class="plus">+${added}</span>` : '<span class="zero">+0</span>'}
          </div>
          <div class="result-tiles">${
            handTiles(hand) || `<span class="result-note">${L().resultEmptyHand}</span>`
          }</div>
          ${
            zeroZero
              ? `<p class="result-note" style="grid-column:1/-1">${L().resultZeroZero}</p>`
              : ''
          }`;
    })
    .join('');
  const outcome = match.outcome;
  let nextNote = '';
  if (!outcome) {
    const nextFirst = mexicanTrainEngine.nextFirst(lastRound);
    const why = lastRound.winner !== null ? L().whyWinner : L().whySwap;
    nextNote = L().nextFirstNote(esc(nameOf(nextFirst)), why);
  }
  return {
    title: result.cause === 'out' ? L().resultOut(esc(nameOf(outPlayer))) : L().resultBlocked,
    sub: `${result.cause === 'out' ? L().resultOutSub : L().resultBlockedSub}${
      result.winner === null ? L().resultTieNote : ''
    }`,
    rows,
    matchLabel: L().matchRoundLabel(match.rounds.length),
    outcomeTitle: !outcome
      ? null
      : outcome.kind === 'draw'
        ? L().matchDraw
        : L().matchWin(esc(nameOf(outcome.winner))),
    nextNote,
  };
}

const TILE_RE = /^[0-6]-[0-6]$/;
const tilesOk = (x: unknown): boolean =>
  Array.isArray(x) && x.every((t) => typeof t === 'string' && TILE_RE.test(t));
const trainOk = (t: unknown): boolean => {
  const train = t as GameState['trains']['mx'] | undefined;
  return (
    !!train &&
    Array.isArray(train.tiles) &&
    train.tiles.every((p) => !!p && typeof p.tile === 'string' && TILE_RE.test(p.tile) && Number.isInteger(p.seq)) &&
    Number.isInteger(train.end) &&
    typeof train.open === 'boolean'
  );
};

/** Проверка сейва из сырого JSON: null — сейв негоден и будет стёрт. */
export function validateSaved(raw: unknown): MatchState | null {
  const m = raw as MatchState | undefined;
  const r = m?.round;
  const ok =
    Array.isArray(m?.names) &&
    m.names.length === 2 &&
    m.names.every((n) => typeof n === 'string') &&
    Array.isArray(m.totals) &&
    m.totals.length === 2 &&
    m.totals.every((n) => typeof n === 'number') &&
    Array.isArray(m.rounds) &&
    m.rounds.length <= ROUNDS &&
    !!r &&
    (r.phase === 'loco' || r.phase === 'main' || r.phase === 'over') &&
    Number.isInteger(r.round) &&
    r.round >= 0 &&
    r.round < ROUNDS &&
    r.loco === ROUNDS - 1 - r.round &&
    Array.isArray(r.hands) &&
    r.hands.length === 2 &&
    tilesOk(r.hands[0]) &&
    tilesOk(r.hands[1]) &&
    tilesOk(r.boneyard) &&
    !!r.trains &&
    trainOk(r.trains.p0) &&
    trainOk(r.trains.p1) &&
    trainOk(r.trains.mx) &&
    (r.current === 0 || r.current === 1) &&
    typeof r.seed === 'number' &&
    Number.isInteger(r.seq) &&
    Array.isArray(r.history) &&
    Array.isArray(r.log) &&
    (m.bot == null ||
      ((m.bot.player === 0 || m.bot.player === 1) && ['easy', 'normal', 'strong'].includes(m.bot.level)));
  return ok ? m : null;
}

/** Кость стола по её номеру: значения половин в порядке клеток. */
function placedValues(s: GameState, seq: number): readonly [number, number] {
  if (seq !== LOCO_SEQ) {
    for (const id of ['p0', 'p1', 'mx'] as const) {
      const p = s.trains[id].tiles.find((x) => x.seq === seq);
      if (p) return p.values;
    }
  }
  return [s.loco, s.loco];
}

/** Собрать игру для каркаса: движок, стол и виды. */
export function createGame(): MexicanTrainGame {
  const view: View = {
    logo: logoSvg,
    titleHtml: () => `${logoSvg(34, 'title-logo')}<span><span class="gold">M</span>exican Train</span>`,
    rulesUrl: rulesDocUrl,
    // Рубашка без эмблемы: временная, до решения о марке.
    tileBack: (o) => tileBack(o),
    openHowTo: (o) => openHowTo({ rulesUrl: rulesDocUrl(), onClose: o.onClose }),
    openHowToAsk,
    // Руки скрыты — игры вдвоём за одним экраном нет.
    hotSeat: false,
    pileSize: 14,

    moveKind: (m) => (m.type === 'loco' ? 'place' : m.type),
    moveTile: (m, s) => (m.type === 'place' ? m.tile : m.type === 'loco' ? locoTile(s.loco) : null),
    placedSeqOf: (m, after) => (m.type === 'loco' ? LOCO_SEQ : m.type === 'place' ? after.seq - 1 : null),
    placedValues,
    // Локомотив ставится торжественно, дубль — жёстче и ниже.
    placeSound: (m) => (m.type === 'loco' ? 'accent' : m.type === 'place' && isDouble(m.tile) ? 'heavy' : 'normal'),
    samePlacement: sameMove,
    ghostMoves: (s, legal, selected) =>
      legal.filter(
        (m) =>
          (m.type === 'place' && m.tile === selected) ||
          (m.type === 'loco' && selected === locoTile(s.loco)),
      ),
    forcedTile: (s) => s.mustPlay,
    forcedToast: (s) => L().toastMustPlay(tileLabel(s.mustPlay!)),
    drawnTile(s) {
      if (s.history[s.history.length - 1]?.type !== 'draw') return null;
      // За добором в журнале может идти запись об открытом поезде.
      for (let i = s.log.length - 1; i >= 0; i--) {
        const e = s.log[i]!;
        if (e.kind === 'draw') return e.tile;
      }
      return null;
    },
    // Место локомотива — в кадре, даже если стол смещали в прошлом раунде.
    refitOnPick: (s) => s.phase === 'loco',

    logSeat: (e) => ('player' in e ? e.player : null),
    describeLog: (e, names) => describeLog(e, names),
    prompt,
    tutor,
    tutorOver: () => L().tutorOver,
    confirmQuestion: (m, s) =>
      m.type === 'loco'
        ? L().confirmLocoAsk(tileLabel(locoTile(s.loco)))
        : m.type === 'place'
          ? L().confirmAsk(tileLabel(m.tile), trainForMover(m.train, s.current))
          : '',

    // Рука соперника закрыта всегда; своя — внизу экрана.
    handHidden: (_s, seat, bottom) => seat !== bottom,
    handMeta: (s, seat, hidden) =>
      hidden
        ? L().handMetaHidden(s.hands[seat].length)
        : L().handMeta(s.hands[seat].length, handSum(s.hands[seat])),
    totalChip: (match, seat) =>
      `<span class="total-chip" data-tip="${esc(L().tipTotal)}">${match.totals[seat]}</span>`,
    roundOver,
    roundSummary: (res, i) =>
      L().roundOptDone(
        i + 1,
        res.cause === 'out' ? L().causeOutShort : L().causeBlockedShort,
        res.sums[0],
        res.sums[1],
      ),

    // Вариант правил один — своих полей на стартовой карточке нет.
    startFields: () => '',
    variantFrom: () => BASE_VARIANT,
    validateSaved,

    loadPrefs: () => undefined,
    dumpPrefs: () => ({}),
    boardFlags: (bottom) => ({ flip: bottom === 1 }),
  };
  return { engine: mexicanTrainEngine, view, board: createBoard };
}
