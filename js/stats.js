// Aggregate statistics over your games: ratings, accuracy, openings, phases, insights, goals.
import { state, myGames, userResult, openingName } from './store.js';
import { openingFamily } from './importers.js';
import { parseGame, moverWin } from './analysis.js';
import { weaknesses, puzzleStreak, duePuzzles } from './training.js';
import { TACTICAL } from './tactics.js';
import { themeName, todayKey, pct, cap } from './ui.js';

export const userAcc = g => g.analysis && g.userColor ? g.analysis.accuracy[g.userColor] : null;
export const analyzedMine = () => myGames().filter(g => g.analysis);
export const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

export function record(games = myGames()) {
  const r = { win: 0, loss: 0, draw: 0, total: 0 };
  for (const g of games) { const x = userResult(g); if (x) { r[x]++; r.total++; } }
  return r;
}

export function latestRatings() {
  const out = {};
  for (const g of myGames()) {
    const k = `${g.source}|${g.timeClass}`;
    const elo = g.userColor === 'w' ? g.whiteElo : g.blackElo;
    if (!elo || out[k]) continue;
    out[k] = { source: g.source, timeClass: g.timeClass, rating: elo, date: g.date };
  }
  return Object.values(out);
}

export function ratingSeries() {
  const series = {};
  for (const g of [...myGames()].reverse()) {
    const elo = g.userColor === 'w' ? g.whiteElo : g.blackElo;
    if (!elo || g.source === 'pgn') continue;
    const k = `${g.source === 'chesscom' ? 'Chess.com' : 'Lichess'} ${cap(g.timeClass)}`;
    (series[k] = series[k] || []).push({ x: g.date, y: elo });
  }
  return series;
}

export function userCounts(g) {
  return g.analysis?.counts?.[g.userColor] || {};
}

export function mistakeStats(games = analyzedMine()) {
  const phase = { opening: { m: 0, b: 0, i: 0 }, middlegame: { m: 0, b: 0, i: 0 }, endgame: { m: 0, b: 0, i: 0 } };
  let blunders = 0, mistakes = 0, inacc = 0;
  for (const g of games) {
    for (const rec of g.analysis.moves) {
      if (rec.color !== g.userColor) continue;
      const ph = phase[rec.phase] || phase.middlegame;
      if (rec.cls === 'blunder') { ph.b++; blunders++; }
      else if (rec.cls === 'mistake' || rec.cls === 'miss') { ph.m++; mistakes++; }
      else if (rec.cls === 'inaccuracy') { ph.i++; inacc++; }
    }
  }
  const n = games.length || 1;
  return { phase, perGame: { blunders: blunders / n, mistakes: mistakes / n, inaccuracies: inacc / n } };
}

export function openingStats() {
  const map = {};
  for (const g of myGames()) {
    const fam = openingFamily(openingName(g));
    const k = g.userColor + '|' + fam;
    const r = map[k] || (map[k] = { color: g.userColor, name: fam, games: 0, win: 0, draw: 0, loss: 0, accs: [] });
    r.games++;
    const res = userResult(g);
    if (res) r[res]++;
    const a = userAcc(g);
    if (a != null) r.accs.push(a);
  }
  return Object.values(map).map(r => ({ ...r, score: Math.round(((r.win + r.draw / 2) / r.games) * 100), acc: avg(r.accs) }))
    .sort((a, b) => b.games - a.games);
}

export function insights() {
  const out = [];
  const games = myGames();
  if (games.length < 3) return out;
  const ops = openingStats().filter(o => o.games >= 4 && o.name !== 'Unknown');
  if (ops.length) {
    const worst = [...ops].sort((a, b) => a.score - b.score)[0];
    const best = [...ops].sort((a, b) => b.score - a.score)[0];
    if (worst.score < 45) out.push({ ic: '📉', text: `Your weakest opening is the <b>${worst.name}</b> as ${worst.color === 'w' ? 'White' : 'Black'} — you score only <b>${worst.score}%</b> in ${worst.games} games.` });
    if (best && best !== worst && best.score >= 55) out.push({ ic: '📈', text: `You do great in the <b>${best.name}</b> as ${best.color === 'w' ? 'White' : 'Black'}: <b>${best.score}%</b> over ${best.games} games. Keep playing it!` });
  }
  const w = record(games.filter(g => g.userColor === 'w')), b = record(games.filter(g => g.userColor === 'b'));
  if (w.total >= 5 && b.total >= 5) {
    const sw = pct(w.win + w.draw / 2, w.total), sb = pct(b.win + b.draw / 2, b.total);
    if (Math.abs(sw - sb) >= 10) out.push({ ic: '♟', text: `You score <b>${sw}%</b> with White but <b>${sb}%</b> with Black. Work on your ${sw > sb ? 'Black' : 'White'} repertoire.` });
  }
  const an = analyzedMine();
  if (an.length >= 3) {
    const ms = mistakeStats(an);
    const ph = Object.entries(ms.phase).map(([k, v]) => [k, v.b * 2 + v.m]).sort((a, b) => b[1] - a[1])[0];
    if (ph[1] > 0) out.push({ ic: '🎯', text: `Most of your costly mistakes happen in the <b>${ph[0]}</b>. ${ph[0] === 'endgame' ? 'Practice endgame puzzles and technique.' : ph[0] === 'opening' ? 'Study your openings a bit deeper.' : 'Slow down and check for tactics before each move.'}` });
    // thrown wins
    let thrown = 0, winning = 0;
    for (const g of an) {
      const wasWinning = g.analysis.positions.some(p => moverWin(p.eval, g.userColor) >= 85);
      if (wasWinning) { winning++; if (userResult(g) !== 'win') thrown++; }
    }
    if (thrown >= 2) out.push({ ic: '🔥', text: `You reached a winning position in ${winning} games but didn't win <b>${thrown}</b> of them. Practice converting advantages (try "Crushing" puzzles).` });
    // time trouble
    let tBl = 0, allBl = 0;
    for (const g of an) {
      let P; try { P = parseGame(g.pgn); } catch { continue; }
      if (!P.clocks.length) continue;
      g.analysis.moves.forEach((rec, i) => {
        if (rec.color !== g.userColor || rec.cls !== 'blunder') return;
        allBl++;
        if (P.clocks[i] != null && P.clocks[i] < 30) tBl++;
      });
    }
    if (allBl >= 3 && tBl / allBl >= 0.3) out.push({ ic: '⏱', text: `<b>${pct(tBl, allBl)}%</b> of your blunders happen with under 30 seconds on the clock. Manage your time earlier in the game.` });
  }
  const wk = weaknesses()[0];
  if (wk) out.push({ ic: '🧩', text: `Your biggest tactical blind spot looks like <b>${themeName(wk.theme)}</b> (missed ${wk.missed}×, fell for it ${wk.allowed}×). <a href="#/puzzles?mode=theme&theme=${wk.theme}">Train it now →</a>` });
  return out;
}

// ---------- Goals ----------
export const GOAL_TYPES = {
  rating: 'Reach a rating',
  accuracy: 'Average accuracy (last 10 analysed games)',
  blunders: 'Max blunders per game (last 10)',
  puzzlesDaily: 'Puzzles solved today',
  streak: 'Puzzle streak (days)',
  analyzeWeekly: 'Games reviewed this week',
  custom: 'Custom checklist goal',
};

export function evaluateGoal(g) {
  const lastN = analyzedMine().slice(0, 10);
  switch (g.type) {
    case 'rating': {
      const r = latestRatings().find(x => x.source === g.source && x.timeClass === g.timeClass);
      const cur = r?.rating ?? null;
      const base = g.start ?? cur ?? 0;
      const p = cur == null ? 0 : g.target <= base ? 100 : ((cur - base) / (g.target - base)) * 100;
      return { cur: cur ?? '—', target: g.target, pct: Math.max(0, Math.min(100, p)), done: cur >= g.target, label: `${g.source === 'chesscom' ? 'Chess.com' : 'Lichess'} ${cap(g.timeClass)} rating ${g.target}` };
    }
    case 'accuracy': {
      const a = avg(lastN.map(userAcc).filter(x => x != null));
      return { cur: a == null ? '—' : a.toFixed(1) + '%', target: g.target + '%', pct: a == null ? 0 : Math.min(100, (a / g.target) * 100), done: a >= g.target, label: `Average accuracy ≥ ${g.target}%` };
    }
    case 'blunders': {
      const n = lastN.length;
      const b = n ? lastN.reduce((s, x) => s + (userCounts(x).blunder || 0), 0) / n : null;
      return { cur: b == null ? '—' : b.toFixed(2), target: g.target, pct: b == null ? 0 : b <= g.target ? 100 : Math.max(0, 100 - (b - g.target) * 50), done: b != null && b <= g.target, label: `≤ ${g.target} blunders per game` };
    }
    case 'puzzlesDaily': {
      const s = state.activity[todayKey()]?.solved || 0;
      return { cur: s, target: g.target, pct: Math.min(100, (s / g.target) * 100), done: s >= g.target, label: `Solve ${g.target} puzzles today` };
    }
    case 'streak': {
      const s = puzzleStreak();
      return { cur: s, target: g.target, pct: Math.min(100, (s / g.target) * 100), done: s >= g.target, label: `${g.target}-day puzzle streak` };
    }
    case 'analyzeWeekly': {
      const wk = Date.now() - 7 * 86400000;
      const n = myGames().filter(x => x.analyzedAt && x.analyzedAt >= wk).length;
      return { cur: n, target: g.target, pct: Math.min(100, (n / g.target) * 100), done: n >= g.target, label: `Review ${g.target} games this week` };
    }
    default:
      return { cur: g.done ? 'Done' : 'Not yet', target: '', pct: g.done ? 100 : 0, done: !!g.done, label: g.text };
  }
}

export function suggestedGoals() {
  const out = [];
  const lr = latestRatings().sort((a, b) => b.date - a.date)[0];
  if (lr) out.push({ type: 'rating', source: lr.source, timeClass: lr.timeClass, target: Math.ceil((lr.rating + 100) / 50) * 50, start: lr.rating });
  const a = avg(analyzedMine().slice(0, 10).map(userAcc).filter(x => x != null));
  out.push({ type: 'accuracy', target: a ? Math.min(95, Math.round(a + 5)) : 80 });
  out.push({ type: 'blunders', target: 0.5 });
  out.push({ type: 'puzzlesDaily', target: 10 });
  out.push({ type: 'streak', target: 7 });
  out.push({ type: 'analyzeWeekly', target: 5 });
  return out;
}

export { duePuzzles };

// ---------- Coach ----------
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const isTimeLoss = g => userResult(g) === 'loss' && /time/i.test(g.termination || '');

/** Score five areas of your play (0-100) from your analysed games + puzzle results. */
export function coachReport() {
  const an = analyzedMine().slice(0, 50);
  if (!an.length) return null;
  let blunders = 0, missedTactics = 0, openWin = [], openMist = 0, wonPos = 0, converted = 0;
  let clockGames = 0, timeTroubleBl = 0, rushedBl = 0, timeLosses = 0;
  for (const g of an) {
    const A = g.analysis;
    let P = null; try { P = parseGame(g.pgn); } catch { /* ignore */ }
    if (P?.clocks.length) clockGames++;
    if (isTimeLoss(g)) timeLosses++;
    A.moves.forEach((rec, i) => {
      if (rec.color !== g.userColor) return;
      if (rec.cls === 'blunder') {
        blunders++;
        if (P?.clocks[i] != null && P.clocks[i] < 30) timeTroubleBl++;
        else if (P?.spent[i] != null && P.spent[i] < 4) rushedBl++;
      }
      if (['mistake', 'blunder', 'miss'].includes(rec.cls) && (rec.missed || []).some(t => TACTICAL.has(t))) missedTactics++;
      if (rec.phase === 'opening' && ['mistake', 'blunder', 'miss'].includes(rec.cls)) openMist++;
    });
    const k = Math.min(20, A.positions.length - 1);
    openWin.push(moverWin(A.positions[k].eval, g.userColor));
    if (A.positions.some(p => moverWin(p.eval, g.userColor) >= 85)) {
      wonPos++;
      const r = userResult(g);
      converted += r === 'win' ? 1 : r === 'draw' ? 0.5 : 0;
    }
  }
  const n = an.length;
  const tacticalPuzzles = Object.entries(state.pstats.themes).filter(([t]) => TACTICAL.has(t)).reduce((a, [, s]) => ({ att: a.att + s.attempts, ok: a.ok + s.solved }), { att: 0, ok: 0 });
  let tactics = clamp(100 - (missedTactics / n) * 30);
  if (tacticalPuzzles.att >= 10) tactics = clamp((tactics + (tacticalPuzzles.ok / tacticalPuzzles.att) * 100) / 2);
  const bpg = blunders / n;
  const avgOpen = avg(openWin);
  const scores = {
    tactics,
    blunders: clamp(100 - bpg * 45),
    conversion: wonPos ? clamp((converted / wonPos) * 100) : null,
    clock: clamp(100 - (timeLosses / n) * 200 - (blunders ? ((timeTroubleBl + rushedBl) / blunders) * 40 : 0)),
    openings: clamp((avgOpen - 20) * 1.6 - (openMist / n) * 10),
  };
  return {
    n, scores,
    details: {
      tactics: `You missed a winning tactic ${(missedTactics / n).toFixed(1)}× per game${tacticalPuzzles.att ? ` and solve ${pct(tacticalPuzzles.ok, tacticalPuzzles.att)}% of tactical puzzles` : ''}.`,
      blunders: `${bpg.toFixed(2)} blunders per game (${blunders} in ${n} games).`,
      conversion: wonPos ? `You reached a winning position in ${wonPos} games and won ${Math.round(converted)} of them.` : 'No clearly winning positions yet in analysed games.',
      clock: `${timeLosses} loss${timeLosses === 1 ? '' : 'es'} on time · ${timeTroubleBl} blunders in time trouble (<30s) · ${rushedBl} rushed blunders (<4s with time left).`,
      openings: `After ~10 moves your average winning chance is ${avgOpen.toFixed(0)}% · ${openMist} opening mistakes in ${n} games.`,
    },
  };
}

/** Why did you lose each game? */
export function lossCauses(limit = 60) {
  const out = [];
  for (const g of myGames().filter(x => userResult(x) === 'loss').slice(0, limit)) {
    if (isTimeLoss(g)) { out.push({ g, cause: 'Lost on time', key: 'time' }); continue; }
    if (!g.analysis) { out.push({ g, cause: 'Not analysed', key: 'none' }); continue; }
    const A = g.analysis;
    if (A.positions.some(p => moverWin(p.eval, g.userColor) >= 80)) {
      const worst = worstMove(g);
      out.push({ g, cause: 'Threw away a winning position', key: 'conversion', ply: worst?.i });
      continue;
    }
    const worst = worstMove(g);
    if (worst && worst.rec.loss >= 20) {
      const allowed = (worst.rec.allowed || []).find(t => TACTICAL.has(t));
      out.push({ g, cause: `Blunder in the ${worst.rec.phase}${allowed ? ` (${themeName(allowed).toLowerCase()})` : ''}`, key: worst.rec.phase, ply: worst.i });
    } else out.push({ g, cause: 'Slowly outplayed', key: 'outplayed', ply: worst?.i });
  }
  return out;
}
function worstMove(g) {
  let best = null;
  g.analysis.moves.forEach((rec, i) => { if (rec.color === g.userColor && (!best || rec.loss > best.rec.loss)) best = { i, rec }; });
  return best;
}
