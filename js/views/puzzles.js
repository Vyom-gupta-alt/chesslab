import { state, save } from '../store.js';
import { Chess } from '../lib.js';
import { Board } from '../board.js';
import { duePuzzles, minePuzzles, recordResult, PuzzleFeed, fetchDailyPuzzle, weaknesses, puzzleStreak, DRILLS, puzzleCats } from '../training.js';
import { primaryTheme, TACTICAL } from '../tactics.js';
import { $, $$, esc, toast, themeName, THEMES, CLS, clsIcon, fmtDate, pct, todayKey } from '../ui.js';
import { refreshBadges } from '../app.js';

let cleanup = [];
export function destroy() { cleanup.forEach(f => f()); cleanup = []; }

const TRAIN_THEMES = ['mix', 'fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'sacrifice', 'mateIn1', 'mateIn2', 'mateIn3',
  'backRankMate', 'promotion', 'advancedPawn', 'defensiveMove', 'quietMove', 'trappedPiece', 'deflection', 'attraction',
  'doubleCheck', 'capturingDefender', 'intermezzo', 'zugzwang', 'kingsideAttack', 'opening', 'middlegame', 'endgame',
  'rookEndgame', 'pawnEndgame', 'crushing', 'advantage', 'equality'];

export function render(root, params) {
  destroy();
  const mode = params.mode || 'home';
  if (mode === 'home') return renderHome(root);
  if (mode === 'bank') return renderBank(root);
  if (mode === 'stats') return renderStats(root);
  return renderSession(root, params);
}

function header(active) {
  const tabs = [['home', 'Overview'], ['drill', 'Mistake drill'], ['weak', 'Weakness trainer'], ['themes', 'By theme'], ['daily', 'Daily'], ['bank', 'My puzzle bank'], ['stats', 'Stats']];
  return `<div class="tabs">${tabs.map(([k, l]) => `<button class="${k === active ? 'active' : ''}" onclick="location.hash='#/puzzles?mode=${k}'">${l}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------- Overview
function renderHome(root) {
  const due = duePuzzles().length;
  const mine = minePuzzles();
  const wk = weaknesses().slice(0, 6);
  const today = state.activity[todayKey()] || {};
  root.innerHTML = `
  <div class="page-head"><div><h1>Puzzles</h1><p>Drill the exact positions you got wrong, then train the same patterns with similar puzzles.</p></div></div>
  ${header('home')}
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><span class="l">Puzzle rating</span><span class="v">${state.pstats.rating}</span><span class="d">from Lichess puzzles</span></div>
    <div class="card kpi"><span class="l">Streak</span><span class="v">🔥 ${puzzleStreak()}</span><span class="d">days in a row</span></div>
    <div class="card kpi"><span class="l">Today</span><span class="v">${today.solved || 0}/${today.puzzles || 0}</span><span class="d">solved / attempted</span></div>
    <div class="card kpi"><span class="l">Your mistakes</span><span class="v">${mine.length}</span><span class="d">${due} due for review</span></div>
  </div>
  <div class="grid g2">
    <div class="card">
      <h2>🎯 Mistake drill</h2>
      <p class="muted" style="line-height:1.5">Every mistake and blunder from your analysed games becomes a puzzle. Spaced repetition brings back the ones you keep missing until you've got them nailed.</p>
      ${mine.length ? `<div class="row"><a class="btn primary lg" href="#/puzzles?mode=drill">${due ? `Drill ${due} due puzzle${due > 1 ? 's' : ''}` : 'Practise all my mistakes'}</a><a class="btn" href="#/puzzles?mode=bank">Browse (${mine.length})</a></div>`
        : `<p class="muted">No mistake puzzles yet — <a href="#/games">analyse some games</a> first.</p>`}
    </div>
    <div class="card">
      <h2>🧠 Your weaknesses</h2>
      ${wk.length ? wk.map(w => `<div class="weak-row">
          <div><b>${themeName(w.theme)}</b><div class="muted small">missed ${w.missed}× · fell for ${w.allowed}×${w.successRate != null ? ` · ${w.successRate}% in puzzles` : ''}</div></div>
          <div class="bar"><i style="width:${Math.min(100, (w.score / wk[0].score) * 100)}%;background:var(--red)"></i></div>
          <a class="btn sm" href="#/puzzles?mode=theme&theme=${w.theme}">Train</a></div>`).join('')
          + `<div style="margin-top:12px"><a class="btn primary" href="#/puzzles?mode=weak">Train all my weaknesses</a></div>`
        : '<p class="muted">Analyse a few games and solve some puzzles — ChessLab will find the tactical patterns you miss most.</p>'}
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h2>Train by theme</h2>
    <div class="theme-grid">${TRAIN_THEMES.map(t => {
      const s = state.pstats.themes[t];
      return `<button class="theme-btn" onclick="location.hash='#/puzzles?mode=theme&theme=${t}'"><div class="tn">${themeName(t)}</div><div class="ts">${s ? `${pct(s.solved, s.attempts)}% · ${s.attempts} done` : 'Not tried yet'}</div></button>`;
    }).join('')}</div>
  </div>`;
}

// ---------------------------------------------------------------- Bank
function renderBank(root) {
  const list = minePuzzles();
  root.innerHTML = `
  <div class="page-head"><div><h1>My puzzle bank</h1><p>${list.length} puzzles generated from your own mistakes.</p></div></div>
  ${header('bank')}
  <div class="card" style="padding:0"><div class="table-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Mistake</th><th>You played</th><th>Best</th><th>Themes</th><th>Record</th><th>Next review</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr>
      <td>${clsIcon(p.cls)}</td>
      <td>${esc(p.playedSan)}</td>
      <td class="muted">${p.attempts ? esc(p.bestSan) : '<i>hidden</i>'}</td>
      <td>${(p.themes || []).filter(t => TACTICAL.has(t)).slice(0, 3).map(t => `<span class="tag">${themeName(t)}</span>`).join('') || `<span class="tag">${themeName(primaryTheme(p.themes))}</span>`}</td>
      <td class="muted">${p.solves}✓ ${p.fails}✗</td>
      <td class="muted">${p.due <= Date.now() ? '<b style="color:var(--orange)">Due now</b>' : fmtDate(p.due)}</td>
      <td><a class="btn sm" href="#/puzzles?mode=one&id=${encodeURIComponent(p.id)}">Play</a> <a class="btn sm ghost" href="#/review/${encodeURIComponent(p.gameId)}?ply=${p.ply}">Game</a></td>
    </tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="big">🧩</div><p>No puzzles yet. Analyse your games and your mistakes will show up here.</p><a class="btn primary" href="#/games">Go to my games</a></div>'}</div></div>`;
}

// ---------------------------------------------------------------- Stats
function renderStats(root) {
  const th = Object.entries(state.pstats.themes).filter(([, s]) => s.attempts > 0).sort((a, b) => b[1].attempts - a[1].attempts);
  const hist = state.pstats.history.filter(h => h.src === 'lichess');
  root.innerHTML = `
  <div class="page-head"><div><h1>Puzzle stats</h1></div></div>
  ${header('stats')}
  <div class="grid g2">
    <div class="card"><h2>Puzzle rating</h2><div class="chart-box"><canvas id="ps-chart"></canvas></div></div>
    <div class="card"><h2>Success by theme</h2>${th.length ? th.map(([t, s]) => {
      const p = pct(s.solved, s.attempts);
      return `<div class="weak-row"><div><b>${themeName(t)}</b><div class="muted small">${s.solved}/${s.attempts}</div></div><div class="bar"><i style="width:${p}%;background:${p < 50 ? 'var(--red)' : p < 75 ? 'var(--orange)' : 'var(--accent)'}"></i></div><span>${p}%</span></div>`;
    }).join('') : '<p class="muted">Solve some puzzles to see stats.</p>'}</div>
  </div>`;
  if (window.Chart && hist.length) {
    const ch = new Chart($('#ps-chart', root), {
      type: 'line',
      data: { labels: hist.map((_, i) => i + 1), datasets: [{ label: 'Rating', data: hist.map(h => h.r), borderColor: '#81b64c', pointRadius: 0, tension: .25 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false } } },
    });
    cleanup.push(() => ch.destroy());
  }
}

// ---------------------------------------------------------------- Solving session
function renderSession(root, params) {
  const mode = params.mode;
  const seen = new Set();
  let feed = null;
  let title = '', sub = '';

  if (mode === 'themes') { location.hash = '#/puzzles'; return; }

  if (mode === 'drill') { title = 'Mistake drill'; sub = 'Positions from your own games — find the move you missed.'; }
  else if (mode === 'game') { const g = state.games[params.id]; title = 'Mistakes from one game'; sub = g ? `${esc(g.white)} vs ${esc(g.black)}` : ''; }
  else if (mode === 'theme') { title = `${themeName(params.theme)} trainer`; sub = 'Your own positions with this pattern first, then similar Lichess puzzles.'; feed = new PuzzleFeed(params.theme); }
  else if (mode === 'weak') {
    const themes = weaknesses().slice(0, 3).map(w => w.theme);
    title = 'Weakness trainer';
    sub = themes.length ? `Focusing on: ${themes.map(themeName).join(', ')}` : 'Mixed puzzles (analyse more games to personalise this)';
    const feeds = (themes.length ? themes : ['mix']).map(t => new PuzzleFeed(t));
    let k = 0;
    feed = { next: () => feeds[k++ % feeds.length].next(), prefetch: () => feeds.forEach(f => f.prefetch()) };
  }
  else if (mode === 'daily') { title = 'Daily puzzle'; sub = 'Lichess puzzle of the day'; }
  else if (mode === 'similar') { title = `Similar puzzles: ${themeName(params.theme)}`; sub = 'Same tactical pattern as the mistake you just drilled.'; feed = new PuzzleFeed(params.theme); }
  else if (mode === 'one') { title = 'Puzzle from your game'; }
  else if (mode === 'cat' && DRILLS[params.cat]) { title = `${DRILLS[params.cat].icon} ${DRILLS[params.cat].name}`; sub = DRILLS[params.cat].desc; }
  else { title = 'Puzzles'; feed = new PuzzleFeed('mix'); }
  feed?.prefetch();

  const nextPuzzle = async () => {
    if (mode === 'drill') {
      const d = duePuzzles().filter(p => !seen.has(p.id));
      if (d.length) return d[0];
      const rest = minePuzzles().filter(p => !seen.has(p.id)).sort((a, b) => (b.fails - b.solves) - (a.fails - a.solves) || a.box - b.box);
      return rest[0] || null;
    }
    if (mode === 'game') return minePuzzles().filter(p => p.gameId === params.id && !seen.has(p.id)).sort((a, b) => a.ply - b.ply)[0] || null;
    if (mode === 'one') return seen.size ? null : state.puzzles[params.id] || null;
    if (mode === 'cat') return minePuzzles().filter(p => !seen.has(p.id) && puzzleCats(p).includes(params.cat)).sort((a, b) => a.box - b.box || a.due - b.due)[0] || null;
    if (mode === 'daily') return seen.size ? null : fetchDailyPuzzle();
    if (mode === 'theme') {
      const own = minePuzzles().find(p => !seen.has(p.id) && p.themes?.includes(params.theme) && p.box < 4);
      if (own) return own;
    }
    return feed ? feed.next() : null;
  };

  root.innerHTML = `
  <div class="page-head"><div><h1>${esc(title)}</h1><p>${sub}</p></div><div class="row"><span class="pill" id="pz-score">0 / 0</span><a class="btn" href="#/puzzles">← All puzzles</a></div></div>
  ${['drill', 'weak', 'daily'].includes(mode) ? header(mode) : ''}
  <div class="board-layout">
    <div class="board-col"><div id="pz-board"></div></div>
    <div class="side-panel">
      <div class="sec"><div class="puz-status turn" id="pz-status">Loading puzzle…</div></div>
      <div class="sec" id="pz-info"></div>
      <div class="sec"><div class="row" id="pz-actions">
        <button class="btn" id="pz-hint">💡 Hint</button>
        <button class="btn" id="pz-sol">👁 Solution</button>
        <button class="btn" id="pz-flip">⇅</button>
        <button class="btn primary" id="pz-next" style="margin-left:auto">Next ›</button>
      </div></div>
      <div class="sec" id="pz-after"></div>
    </div>
  </div>`;

  let pz = null, chess = null, step = 0, failed = false, finished = false, busy = false;
  let solved = 0, total = 0;
  const board = new Board($('#pz-board', root), {
    dests: sq => (!chess || finished || busy) ? [] : chess.moves({ square: sq, verbose: true }).map(m => m.to),
    inCheck: fen => new Chess(fen).inCheck(),
    movable: c => pz && c === pz.solver && !finished && !busy,
    onMove: (from, to, promo) => onMove(from, to, promo),
  });

  const status = (cls, html) => { const s = $('#pz-status', root); s.className = 'puz-status ' + cls; s.innerHTML = html; };
  const solverTurnHtml = () => `<span class="turn-dot" style="background:${pz.solver === 'w' ? '#fff' : '#000'}"></span> Your turn — find the best move for ${pz.solver === 'w' ? 'White' : 'Black'}`;

  async function load() {
    busy = true;
    status('turn', 'Loading puzzle…');
    $('#pz-after', root).innerHTML = '';
    $('#pz-info', root).innerHTML = '';
    let p;
    try { p = await nextPuzzle(); }
    catch (e) { status('bad', esc(e.message)); busy = false; return; }
    if (!p) {
      status('done', ['drill', 'game', 'cat'].includes(mode) ?'🎉 All done! No more puzzles here.' : 'No more puzzles.');
      $('#pz-after', root).innerHTML = `<div class="row"><a class="btn primary" href="#/puzzles?mode=weak">Train my weaknesses</a><a class="btn" href="#/puzzles">Overview</a></div>`;
      busy = false;
      return;
    }
    pz = { ...p, solver: p.fen.split(' ')[1] };
    seen.add(p.id);
    chess = new Chess(p.fen);
    step = 0; failed = false; finished = false; busy = false;
    board.set({ fen: p.fen, lastMove: p.lastMove, orientation: pz.solver, arrows: [], marks: {}, badge: null });
    status('turn', solverTurnHtml());
    const g = p.gameId ? state.games[p.gameId] : null;
    $('#pz-info', root).innerHTML = p.source === 'mine'
      ? `<div class="row">${clsIcon(p.cls)} <span>In your game ${g ? `vs <b>${esc(g.userColor === 'w' ? g.black : g.white)}</b> (${fmtDate(g.date)})` : ''} you played <b>${esc(p.playedSan)}</b> — a ${CLS[p.cls]?.label.toLowerCase()}.</span></div>
         <p class="muted small" style="margin:8px 0 0">Seen ${p.attempts}× · ${p.solves} solved · box ${p.box}/6</p>`
      : `<div class="spread"><span>Lichess puzzle${p.rating ? ` · rated <b>${p.rating}</b>` : ''}</span><span class="muted small">Your rating ${state.pstats.rating}</span></div>`;
    feed?.prefetch?.();
  }

  function finish(success) {
    finished = true;
    total++;
    if (success && !failed) solved++;
    $('#pz-score', root).textContent = `${solved} / ${total}`;
    recordResult(pz, success && !failed);
    refreshBadges();
    if (success && !failed) status('ok', '✅ Correct! Puzzle solved.');
    else if (success) status('done', '✔ Solved — but with help. It will come back for review.');
    else status('bad', '✗ Here is the solution. This one will come back soon.');
    const tactical = (pz.themes || []).filter(t => THEMES[t]);
    const main = primaryTheme(pz.themes);
    $('#pz-after', root).innerHTML = `
      ${tactical.length ? `<div style="margin-bottom:10px">${tactical.map(t => `<span class="tag">${themeName(t)}</span>`).join('')}</div>` : ''}
      <div class="row">
        ${main && main !== 'mix' ? `<a class="btn" href="#/puzzles?mode=similar&theme=${main}">🔁 Practise similar (${themeName(main)})</a>` : ''}
        ${pz.source === 'mine' && pz.gameId ? `<a class="btn" href="#/review/${encodeURIComponent(pz.gameId)}?ply=${pz.ply + 1}">View in game</a>` : ''}
        ${pz.url ? `<a class="btn ghost" href="${pz.url}" target="_blank" rel="noopener">Lichess ↗</a>` : ''}
      </div>`;
  }

  function playReply() {
    if (step >= pz.solution.length) return finish(true);
    busy = true;
    setTimeout(() => {
      const u = pz.solution[step];
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      step++;
      board.set({ fen: chess.fen(), lastMove: [m.from, m.to], marks: {}, arrows: [] });
      busy = false;
      if (step >= pz.solution.length) finish(true);
      else status('turn', '👍 Good — keep going!');
    }, 450);
  }

  function onMove(from, to, promo) {
    if (finished || busy) return;
    const before = chess.fen();
    let m;
    try { m = chess.move({ from, to, promotion: promo || 'q' }); } catch { board.render(); return; }
    const uci = m.from + m.to + (m.promotion || '');
    const expected = pz.solution[step];
    const ok = uci === expected || (step === 0 && pz.solution.length === 1 && pz.alts?.includes(uci)) || chess.isCheckmate();
    if (ok) {
      step++;
      board.set({ fen: chess.fen(), lastMove: [from, to], marks: { [to]: 'right' }, arrows: [] });
      if (chess.isCheckmate() || step >= pz.solution.length) return finish(true);
      playReply();
    } else {
      failed = true;
      board.set({ fen: chess.fen(), lastMove: [from, to], marks: { [to]: 'wrong' }, arrows: [] });
      status('bad', `✗ ${esc(m.san)} isn't the move. Try again!`);
      busy = true;
      setTimeout(() => {
        chess.load(before);
        board.set({ fen: before, lastMove: null, marks: {}, arrows: [] });
        busy = false;
        if (!finished) status('turn', solverTurnHtml());
      }, 900);
    }
  }

  $('#pz-hint', root).onclick = () => {
    if (!pz || finished) return;
    failed = true;
    const u = pz.solution[step];
    board.set({ marks: { [u.slice(0, 2)]: 'hint' } });
  };
  $('#pz-sol', root).onclick = async () => {
    if (!pz || finished || busy) return;
    failed = true;
    busy = true;
    while (step < pz.solution.length) {
      const u = pz.solution[step];
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      board.set({ fen: chess.fen(), lastMove: [m.from, m.to], arrows: step % 2 === 0 ? [{ from: m.from, to: m.to, color: 'rgba(129,182,76,.85)' }] : [], marks: {} });
      step++;
      await new Promise(r => setTimeout(r, 700));
    }
    busy = false;
    finish(false);
  };
  $('#pz-flip', root).onclick = () => board.flip();
  $('#pz-next', root).onclick = () => { if (!busy) load(); };

  load();
}
