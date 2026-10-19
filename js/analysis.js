// Game parsing, engine review, accuracy + move classification, and mistake → puzzle generation.
import { Chess } from './lib.js';
import { detectThemes, phaseOf, boardFromFen, sqIdx, isEnPrise, VAL } from './tactics.js';
import { loadBook, inBook, openingOf } from './openings.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---------- Evaluation math (Lichess formulas) ----------
export const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
export function evalCp(ev) {
  if (!ev) return 0;
  if (ev.mate != null) return ev.mate > 0 ? 10000 - ev.mate : ev.mate < 0 ? -10000 - ev.mate : 0;
  return Math.max(-5000, Math.min(5000, ev.cp));
}
export const whiteWin = ev => ev?.mate != null ? (ev.mate > 0 ? 100 : 0) : winPct(evalCp(ev));
export const moverWin = (ev, color) => color === 'w' ? whiteWin(ev) : 100 - whiteWin(ev);
export const moveAccuracy = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

export function fmtEval(ev) {
  if (!ev) return '0.0';
  if (ev.mate != null) return (ev.mate > 0 ? '+M' : '-M') + Math.abs(ev.mate);
  if (Math.abs(ev.cp) >= 10000) return ev.cp > 0 ? '1-0' : '0-1';
  const v = ev.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
const mateFor = (ev, color) => ev?.mate != null && ((color === 'w') === (ev.mate > 0)) ? Math.abs(ev.mate) : 0;

// ---------- PGN parsing ----------
const toSec = s => s.split(':').reduce((a, x) => a * 60 + parseFloat(x), 0);
const parsedCache = new Map();

export function parseGame(pgn) {
  if (parsedCache.has(pgn)) return parsedCache.get(pgn);
  const c = new Chess();
  c.loadPgn(pgn);
  const headers = c.getHeaders ? c.getHeaders() : c.header();
  const hist = c.history({ verbose: true });
  const start = headers.FEN || START_FEN;
  const r = new Chess(start);
  const fens = [r.fen()], moves = [];
  for (const m of hist) {
    const fb = r.fen();
    const mm = r.move({ from: m.from, to: m.to, promotion: m.promotion });
    moves.push({
      san: mm.san, uci: mm.from + mm.to + (mm.promotion || ''), from: mm.from, to: mm.to, color: mm.color,
      piece: mm.piece, captured: mm.captured, promotion: mm.promotion, fenBefore: fb, fenAfter: r.fen(),
    });
    fens.push(r.fen());
  }
  const clocks = [...pgn.matchAll(/\[%clk\s+([\d:.]+)\]/g)].map(x => toSec(x[1]));
  const tc = (headers.TimeControl || '').split('+');
  const inc = tc.length > 1 ? +tc[1] || 0 : 0;
  const spent = clocks.length >= moves.length
    ? moves.map((_, i) => i < 2 ? null : Math.max(0, clocks[i - 2] - clocks[i] + inc))
    : [];
  const out = { headers, moves, fens, clocks, spent, start };
  parsedCache.set(pgn, out);
  return out;
}

export function uciToSan(fen, uci) {
  try {
    const c = new Chess(fen);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch { return uci; }
}
export function pvToSan(fen, pv, max = 10) {
  const c = new Chess(fen);
  const out = [];
  let n = +fen.split(' ')[5], first = true;
  for (const u of pv.slice(0, max)) {
    try {
      const turn = c.turn();
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (turn === 'w') out.push(`${n}. ${m.san}`);
      else { out.push(first ? `${n}... ${m.san}` : m.san); n++; }
      first = false;
    } catch { break; }
  }
  return out.join(' ');
}

// ---------- Lichess cloud evaluation (fast for known/opening positions) ----------
let cloudCooldownUntil = 0;
async function cloudEval(fen) {
  if (Date.now() < cloudCooldownUntil) return null;
  try {
    const r = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=2`);
    if (r.status === 429) { cloudCooldownUntil = Date.now() + 5 * 60000; return null; }
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.pvs?.length) return null;
    const conv = p => ({ eval: p.mate != null ? { mate: p.mate } : { cp: p.cp }, pv: p.moves.split(' ') });
    const l0 = conv(j.pvs[0]), l1 = j.pvs[1] ? conv(j.pvs[1]) : null;
    return { eval: l0.eval, best: l0.pv[0], pv: l0.pv.slice(0, 10), second: l1 ? { eval: l1.eval, move: l1.pv[0] } : null, cloud: true };
  } catch { return null; }
}

// ---------- Full game analysis ----------
export async function analyzeGame(game, { engine, depth = 12, useCloud = true, onProgress, token }) {
  await loadBook();
  const P = parseGame(game.pgn);
  const N = P.fens.length;
  const pos = new Array(N);
  let cloudOk = useCloud;
  for (let i = 0; i < N; i++) {
    if (token?.cancelled) throw new Error('cancelled');
    const fen = P.fens[i];
    const c = new Chess(fen);
    if (c.isCheckmate()) pos[i] = { eval: { cp: c.turn() === 'w' ? -10000 : 10000 }, best: null, pv: [] };
    else if (c.isStalemate() || c.isInsufficientMaterial()) pos[i] = { eval: { cp: 0 }, best: null, pv: [] };
    else {
      let r = null;
      if (cloudOk && i < 30) { r = await cloudEval(fen); if (!r) cloudOk = false; }
      if (!r) {
        const res = await engine.analyze(fen, { depth, multipv: 2 });
        const [l0, l1] = res.lines;
        r = l0
          ? { eval: l0.score, best: l0.pv[0], pv: l0.pv.slice(0, 10), second: l1 ? { eval: l1.score, move: l1.pv[0] } : null }
          : { eval: { cp: 0 }, best: res.bestmove, pv: [res.bestmove] };
      }
      pos[i] = r;
    }
    onProgress?.((i + 1) / N);
  }
  return classify(P, pos, depth);
}

function isSacrifice(m) {
  if (m.piece === 'p' || m.piece === 'k' || m.promotion) return false;
  const b = boardFromFen(m.fenAfter);
  const i = sqIdx(m.to);
  if (!isEnPrise(b, i)) return false;
  return !m.captured || VAL[m.captured] < VAL[m.piece];
}

export function classify(P, pos, depth) {
  const moves = [];
  const counts = { w: {}, b: {} };
  const accs = { w: [], b: [] };
  let stillBook = true;
  P.moves.forEach((m, i) => {
    const pb = pos[i], pa = pos[i + 1];
    const color = m.color;
    const wb = moverWin(pb.eval, color);
    const isBest = pb.best === m.uci;
    // If the played move was the engine's 2nd choice, use that line's score from the same search (less noisy).
    const wa = !isBest && pb.second && pb.second.move === m.uci
      ? Math.max(moverWin(pa.eval, color), moverWin(pb.second.eval, color))
      : moverWin(pa.eval, color);
    const book = stillBook && inBook(m.fenAfter);
    if (!book) stillBook = false;
    const loss = isBest || book ? 0 : Math.max(0, wb - wa);
    const acc = moveAccuracy(loss);
    const legal = new Chess(m.fenBefore).moves().length;
    let cls;
    if (legal === 1) cls = 'forced';
    else if (book) cls = 'book';
    else if (isBest || loss < 1) {
      const secondWin = pb.second ? moverWin(pb.second.eval, color) : null;
      if (isSacrifice(m) && wa >= 45 && wb < 97 && loss < 2) cls = 'brilliant';
      else if (isBest && secondWin != null && wb - secondWin >= 18 && wb > 25 && wb < 97) cls = 'great';
      else cls = isBest ? 'best' : 'excellent';
    }
    else if (loss < 2.5) cls = 'excellent';
    else if (loss < 5) cls = 'good';
    else if (loss < 10) cls = 'inaccuracy';
    else if (loss < 20) cls = 'mistake';
    else cls = 'blunder';
    // "Miss": opponent just erred and you failed to punish it
    const prev = moves[i - 1];
    if (['inaccuracy', 'mistake', 'blunder'].includes(cls) && prev && ['mistake', 'blunder'].includes(prev.cls) && wb >= 62 && loss >= 10) cls = 'miss';

    const rec = { cls, color, loss: +loss.toFixed(1), acc: +acc.toFixed(1), phase: phaseOf(m.fenBefore, i) };
    if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(cls)) {
      rec.missed = detectThemes(m.fenBefore, pb.pv, { mateIn: mateFor(pb.eval, color), winAfter: wb, ply: i });
      const opp = color === 'w' ? 'b' : 'w';
      if (pa.pv?.length) rec.allowed = detectThemes(m.fenAfter, pa.pv, { mateIn: mateFor(pa.eval, opp), winAfter: 100 - wa, ply: i + 1 });
    }
    moves.push(rec);
    counts[color][cls] = (counts[color][cls] || 0) + 1;
    accs[color].push(acc);
  });
  const gameAcc = arr => {
    if (!arr.length) return null;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const harm = arr.length / arr.reduce((a, b) => a + 1 / Math.max(b, 5), 0);
    return +((mean + harm) / 2).toFixed(1);
  };
  return {
    version: 1, depth, date: Date.now(), opening: openingOf(P.fens),
    positions: pos.map(p => ({ eval: p.eval, best: p.best, pv: p.pv, second: p.second, cloud: !!p.cloud })),
    moves, counts, accuracy: { w: gameAcc(accs.w), b: gameAcc(accs.b) },
  };
}

// ---------- Puzzles from your own mistakes ----------
export function puzzlesFromGame(game) {
  const A = game.analysis;
  if (!A) return [];
  const P = parseGame(game.pgn);
  const out = [];
  P.moves.forEach((m, i) => {
    const rec = A.moves[i];
    if (!['mistake', 'blunder', 'miss'].includes(rec.cls)) return;
    if (game.userColor && m.color !== game.userColor) return;
    const pb = A.positions[i];
    if (!pb.best) return;
    const wb = moverWin(pb.eval, m.color);
    if (wb < 25) return; // already lost; finding the "best" move teaches little
    const mate = mateFor(pb.eval, m.color);
    let solution = [pb.best];
    if (mate > 0 && mate <= 3 && pb.pv.length >= mate * 2 - 1) solution = pb.pv.slice(0, mate * 2 - 1);
    const alts = [];
    if (solution.length === 1 && pb.second && moverWin(pb.second.eval, m.color) >= wb - 3) alts.push(pb.second.move);
    out.push({
      id: `${game.id}_${i}`, source: 'mine', gameId: game.id, ply: i, fen: m.fenBefore,
      lastMove: i > 0 ? [P.moves[i - 1].from, P.moves[i - 1].to] : null,
      solution, alts, themes: rec.missed || [], allowedThemes: rec.allowed || [],
      playedSan: m.san, bestSan: uciToSan(m.fenBefore, pb.best), cls: rec.cls,
      evalBest: pb.eval, created: Date.now(), box: 0, due: Date.now(), attempts: 0, fails: 0, solves: 0,
    });
  });
  return out;
}

// ---------- Coach explanations ----------
const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
function material(fen, color) {
  let s = 0;
  for (const p of boardFromFen(fen)) if (p && p.t !== 'k') s += (p.c === color ? 1 : -1) * VAL[p.t];
  return s;
}
function materialAfter(fen, pv, color) {
  const c = new Chess(fen);
  for (const u of pv) { try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; } }
  return material(c.fen(), color) - material(fen, color);
}
const pts = n => `${n} point${n === 1 ? '' : 's'}`;

/** Plain-English explanation of why a move was a mistake (built from the engine lines). */
export function coachExplain(m, rec, pb, pa, spent) {
  const out = [];
  const color = m.color, opp = color === 'w' ? 'b' : 'w';
  if (m.piece !== 'p' && m.piece !== 'k' && isEnPrise(boardFromFen(m.fenAfter), sqIdx(m.to)))
    out.push(`Your ${PIECE[m.piece]} on ${m.to} can be won — it's attacked and not properly defended.`);
  if (pa?.pv?.length) {
    const reply = uciToSan(m.fenAfter, pa.pv[0]);
    const oppMate = mateFor(pa.eval, opp);
    const swing = materialAfter(m.fenAfter, pa.pv.slice(0, 6), color);
    if (oppMate) out.push(`After ${m.san}, your opponent has a forced mate in ${oppMate}: <b>${pvToSan(m.fenAfter, pa.pv, oppMate * 2 - 1)}</b>.`);
    else if (swing <= -2) out.push(`After ${m.san}, <b>${reply}</b> wins material. Following the best line (${pvToSan(m.fenAfter, pa.pv, 6)}) you'd be about ${pts(-swing)} down.`);
    else out.push(`After ${m.san}, your opponent's best reply is <b>${reply}</b> (${pvToSan(m.fenAfter, pa.pv, 6)}), and the evaluation drops to ${fmtEval(pa.eval)}.`);
  }
  if (pb?.best) {
    const bestSan = uciToSan(m.fenBefore, pb.best);
    const myMate = mateFor(pb.eval, color);
    const gain = materialAfter(m.fenBefore, pb.pv.slice(0, 6), color);
    if (myMate) out.push(`Instead, <b>${bestSan}</b> forced checkmate in ${myMate}.`);
    else if (gain >= 2) out.push(`Instead, <b>${bestSan}</b> would have won about ${pts(gain)} of material: ${pvToSan(m.fenBefore, pb.pv, 6)}.`);
    else out.push(`Better was <b>${bestSan}</b>, keeping the position at ${fmtEval(pb.eval)}: ${pvToSan(m.fenBefore, pb.pv, 6)}.`);
  }
  if (spent != null && spent < 4) out.push(`⏱ You spent only ${spent.toFixed(1)}s on this move — a critical moment deserved more thought.`);
  return out;
}

// ---------- Natural-language move comments ----------
const THEME_TEXT = {
  fork: 'a fork', pin: 'a pin', skewer: 'a skewer', discoveredAttack: 'a discovered attack', hangingPiece: 'a free piece',
  sacrifice: 'a winning sacrifice', promotion: 'a promotion', advancedPawn: 'a pawn breakthrough', backRankMate: 'a back-rank mate',
  mateIn1: 'mate in 1', mateIn2: 'mate in 2', mateIn3: 'mate in 3', mateIn4: 'mate in 4', mateIn5: 'a forced mate', doubleCheck: 'a double check',
};
const firstTactic = arr => (arr || []).find(t => THEME_TEXT[t]);

export function moveComment(m, rec, pb, pa) {
  const best = pb?.best ? uciToSan(m.fenBefore, pb.best) : null;
  const a = /^[aeiou]/i.test(rec.cls) ? 'an' : 'a';
  switch (rec.cls) {
    case 'brilliant': return `<b>${m.san}</b> is brilliant! A sound sacrifice that keeps the advantage.`;
    case 'great': return `<b>${m.san}</b> is a great move — the only move that holds the position.`;
    case 'best': return `<b>${m.san}</b> is the best move.`;
    case 'book': return `<b>${m.san}</b> is a book move.`;
    case 'forced': return `<b>${m.san}</b> was forced — the only legal move.`;
    case 'excellent': return `<b>${m.san}</b> is excellent.${best && best !== m.san ? ` Engine slightly prefers <b>${best}</b>.` : ''}`;
    case 'good': return `<b>${m.san}</b> is good. Best was <b>${best}</b>.`;
  }
  let s = rec.cls === 'miss'
    ? `<b>${m.san}</b> misses the chance to punish your opponent's error.`
    : `<b>${m.san}</b> is ${a} ${rec.cls}.`;
  if (best) s += ` Best was <b>${best}</b> (${fmtEval(pb.eval)})`;
  const mt = firstTactic(rec.missed);
  s += mt ? `, which wins with ${THEME_TEXT[mt]}.` : '.';
  const at = firstTactic(rec.allowed);
  if (at && pa?.best) s += ` Now your opponent has ${THEME_TEXT[at]} with <b>${uciToSan(m.fenAfter, pa.best)}</b>.`;
  return s;
}
