// Puzzle sources, spaced repetition, puzzle rating and weakness detection.
import { Chess } from './lib.js';
import { state, save, bump, myGames } from './store.js';
import { TACTICAL } from './tactics.js';
import { parseGame, moverWin } from './analysis.js';

const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 16, 35, 80]; // days per Leitner box

export const duePuzzles = () => Object.values(state.puzzles).filter(p => p.due <= Date.now()).sort((a, b) => a.due - b.due);
export const minePuzzles = () => Object.values(state.puzzles).sort((a, b) => b.created - a.created);

/** Record a puzzle attempt. firstTry = solved without any wrong move/hint. */
export function recordResult(puzzle, firstTry) {
  const today = new Date().toDateString();
  const firstToday = puzzle._lastAttempt !== today;
  bump('puzzles');
  if (firstTry) bump('solved');

  // theme stats
  if (firstToday) {
    for (const t of puzzle.themes || []) {
      const s = state.pstats.themes[t] || (state.pstats.themes[t] = { attempts: 0, solved: 0 });
      s.attempts++;
      if (firstTry) s.solved++;
    }
  }

  // puzzle rating (only Lichess puzzles have a rating)
  if (puzzle.source === 'lichess' && puzzle.rating && firstToday) {
    const exp = 1 / (1 + 10 ** ((puzzle.rating - state.pstats.rating) / 400));
    const k = state.pstats.history.length < 30 ? 40 : 20;
    state.pstats.rating = Math.round(state.pstats.rating + k * ((firstTry ? 1 : 0) - exp));
  }
  state.pstats.history.push({ t: Date.now(), id: puzzle.id, ok: firstTry, r: state.pstats.rating, src: puzzle.source });
  if (state.pstats.history.length > 3000) state.pstats.history.splice(0, 1000);
  save('pstats');

  // spaced repetition for your own mistakes
  const mine = state.puzzles[puzzle.id];
  if (mine) {
    mine.attempts++;
    mine._lastAttempt = today;
    if (firstTry) { mine.solves++; mine.box = Math.min(INTERVALS.length - 1, mine.box + 1); mine.due = Date.now() + INTERVALS[mine.box] * DAY; }
    else { mine.fails++; mine.box = 0; mine.due = Date.now() + 10 * 60000; }
    save('puzzles');
  }
}

// ---------- Lichess puzzles ----------
export function lichessToPuzzle(j) {
  const c = new Chess();
  c.loadPgn(j.game.pgn);
  const sol = j.puzzle.solution;
  const legal = (ch, u) => ch.moves({ verbose: true }).some(m => m.from + m.to + (m.promotion || '') === u);
  let hist = c.history({ verbose: true });
  if (!legal(c, sol[0])) { c.undo(); hist = c.history({ verbose: true }); }
  const last = hist[hist.length - 1];
  return {
    id: 'lp_' + j.puzzle.id, source: 'lichess', fen: c.fen(), solution: sol, alts: [],
    themes: j.puzzle.themes || [], rating: j.puzzle.rating, lastMove: last ? [last.from, last.to] : null,
    url: `https://lichess.org/training/${j.puzzle.id}`, plays: j.puzzle.plays,
  };
}

export async function fetchLichessPuzzle(theme = 'mix') {
  const diff = state.settings.puzzleDifficulty || 'normal';
  const r = await fetch(`https://lichess.org/api/puzzle/next?angle=${encodeURIComponent(theme)}&difficulty=${diff}`);
  if (r.status === 429) throw new Error('Lichess rate limit — wait a moment');
  if (!r.ok) throw new Error(`Couldn't load a puzzle (Lichess ${r.status})`);
  return lichessToPuzzle(await r.json());
}
export async function fetchDailyPuzzle() {
  const r = await fetch('https://lichess.org/api/puzzle/daily');
  if (!r.ok) throw new Error(`Couldn't load the daily puzzle (${r.status})`);
  return lichessToPuzzle(await r.json());
}

/** Small prefetching queue so the next puzzle appears instantly. */
export class PuzzleFeed {
  constructor(theme) { this.theme = theme; this.buf = []; this.pending = null; }
  async next() {
    const p = this.buf.length ? this.buf.shift() : await fetchLichessPuzzle(this.theme);
    this.prefetch();
    return p;
  }
  prefetch() {
    if (this.pending || this.buf.length >= 2) return;
    this.pending = fetchLichessPuzzle(this.theme).then(p => this.buf.push(p)).catch(() => {}).finally(() => { this.pending = null; });
  }
}

// ---------- Weakness detection ----------
/**
 * Score each tactical theme by how often it shows up in your game mistakes (missed or allowed)
 * and how often you fail puzzles with it. Higher score = bigger weakness.
 */
export function weaknesses() {
  const t = {};
  const get = k => t[k] || (t[k] = { theme: k, missed: 0, allowed: 0, attempts: 0, solved: 0 });
  for (const g of myGames()) {
    if (!g.analysis) continue;
    g.analysis.moves.forEach(rec => {
      if (rec.color !== g.userColor) return;
      if (!['mistake', 'blunder', 'miss'].includes(rec.cls)) return;
      for (const th of rec.missed || []) if (TACTICAL.has(th)) get(th).missed++;
      for (const th of rec.allowed || []) if (TACTICAL.has(th)) get(th).allowed++;
    });
  }
  for (const [k, s] of Object.entries(state.pstats.themes)) {
    if (!TACTICAL.has(k)) continue;
    const r = get(k);
    r.attempts = s.attempts; r.solved = s.solved;
  }
  const list = Object.values(t).map(r => {
    const failRate = r.attempts ? 1 - r.solved / r.attempts : 0.5;
    r.successRate = r.attempts ? Math.round((r.solved / r.attempts) * 100) : null;
    r.score = (r.missed * 2 + r.allowed * 1.5) * (0.5 + failRate) + (r.attempts >= 5 ? failRate * 6 : 0);
    return r;
  });
  return list.filter(r => r.score > 0).sort((a, b) => b.score - a.score);
}

// ---------- Mistake drill categories (Coach) ----------
export const DRILLS = {
  finish: { name: 'Finish the win', icon: '🏁', desc: 'You were winning and let it slip. Find the move that keeps the win.' },
  fight: { name: 'Fight back', icon: '🛡', desc: 'You were worse and made it worse. Find the toughest defence.' },
  trap: { name: 'Spot the trap', icon: '🪤', desc: 'Your move walked into a tactic. Find the safe move instead.' },
  rushed: { name: 'Rushed moves', icon: '⚡', desc: 'Mistakes you played in under 4 seconds with time on the clock.' },
};
const ctxCache = new Map();
export function puzzleContext(p) {
  if (ctxCache.has(p.id)) return ctxCache.get(p.id);
  const g = state.games[p.gameId];
  let ctx = null;
  if (g?.analysis) {
    const pos = g.analysis.positions[p.ply];
    const color = p.fen.split(' ')[1];
    let spent = null, clock = null;
    try { const P = parseGame(g.pgn); spent = P.spent[p.ply]; clock = P.clocks[p.ply]; } catch { /* ignore */ }
    ctx = { wb: moverWin(pos.eval, color), spent, clock };
  }
  ctxCache.set(p.id, ctx);
  return ctx;
}
export function puzzleCats(p) {
  const c = puzzleContext(p);
  const cats = [];
  if (!c) return cats;
  if (c.wb >= 70) cats.push('finish');
  if (c.wb <= 40) cats.push('fight');
  if ((p.allowedThemes || []).some(t => TACTICAL.has(t))) cats.push('trap');
  if (c.spent != null && c.spent < 4 && (c.clock == null || c.clock > 30)) cats.push('rushed');
  return cats;
}

export function puzzleStreak() {
  let streak = 0;
  const d = new Date();
  for (; ;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const a = state.activity[k];
    if (a && a.puzzles > 0) streak++;
    else if (streak > 0 || k !== todayStr()) break;
    d.setDate(d.getDate() - 1);
    if (streak > 3650) break;
  }
  return streak;
}
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
