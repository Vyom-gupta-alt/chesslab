// Openings: learn lines from the Lichess opening library, see the repertoire you actually play,
// and drill lines from memory with spaced repetition.
import { state, save, myGames, userResult } from '../store.js';
import { Chess } from '../lib.js';
import { Board } from '../board.js';
import { parseGame } from '../analysis.js';
import { loadBook, inBook, openingOf } from '../openings.js';
import { $, esc, toast, pct, fmtDate, clsIcon, CLS } from '../ui.js';

let cleanup = [];
export function destroy() { cleanup.forEach(f => f()); cleanup = []; }

const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
let LINES = null;
async function loadLines() {
  if (!LINES) LINES = await fetch(new URL('../data/opening-lines.json', import.meta.url)).then(r => r.json());
  return LINES;
}
const family = name => name.split(':')[0].trim();
const sideFor = name => /Defen[cs]e|Counter|Gambit Declined|Black/i.test(family(name)) ? 'b' : 'w';
const lineId = (moves, color) => color + ':' + moves.join(' ');
const fmtLine = moves => moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + m).join(' ');

function tabs(active) {
  const t = [['mine', 'From my games'], ['library', 'Opening library'], ['rep', 'My repertoire']];
  return `<div class="tabs">${t.map(([k, l]) => `<button class="${k === active ? 'active' : ''}" onclick="location.hash='#/openings?tab=${k}'">${l}</button>`).join('')}</div>`;
}

export async function render(root, params) {
  destroy();
  if (params.train) return renderTrainer(root, params);
  const tab = params.tab || 'mine';
  const due = Object.values(state.repertoire).filter(r => r.due <= Date.now()).length;
  root.innerHTML = `
    <div class="page-head"><div><h1>Openings</h1><p>Learn openings, see what you really play, and drill your lines until they're second nature.</p></div>
      <div class="row">${Object.keys(state.repertoire).length ? `<a class="btn primary" href="#/openings?train=due">▶ Drill ${due ? `${due} due line${due > 1 ? 's' : ''}` : 'my repertoire'}</a>` : ''}</div></div>
    ${tabs(tab)}<div id="op-body"><p class="muted">Loading…</p></div>`;
  const body = $('#op-body', root);
  if (tab === 'library') return renderLibrary(body, params);
  if (tab === 'rep') return renderRep(body);
  return renderMine(body);
}

// ---------------------------------------------------------------- From my games
async function renderMine(body) {
  await loadBook();
  const games = myGames();
  if (!games.length) { body.innerHTML = `<div class="card empty"><p>Import some games first.</p><a class="btn primary" href="#/import">Import games</a></div>`; return; }
  const agg = { w: {}, b: {} };
  const leaks = [];
  for (const g of games) {
    let P; try { P = parseGame(g.pgn); } catch { continue; }
    if (P.start.split(' ')[0] !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR') continue;
    let k = 0;
    while (k < P.moves.length && k < 30 && inBook(P.moves[k].fenAfter)) k++;
    const bookMoves = P.moves.slice(0, k).map(m => m.san);
    const key = bookMoves.join(' ');
    const r = agg[g.userColor][key] || (agg[g.userColor][key] = { moves: bookMoves, games: 0, win: 0, draw: 0, loss: 0, opening: openingOf(P.fens), exits: {}, ids: [] });
    r.games++;
    const res = userResult(g); if (res) r[res]++;
    r.ids.push(g.id);
    const exit = P.moves[k];
    if (exit) {
      const who = exit.color === g.userColor ? 'you' : 'opp';
      const ek = `${who}|${exit.san}`;
      r.exits[ek] = (r.exits[ek] || 0) + 1;
    }
    // opening mistakes by you
    if (g.analysis) {
      g.analysis.moves.forEach((rec, i) => {
        if (rec.color === g.userColor && rec.phase === 'opening' && ['mistake', 'blunder', 'miss', 'inaccuracy'].includes(rec.cls) && i < 30)
          leaks.push({ g, i, rec, san: P.moves[i].san });
      });
    }
  }
  const section = c => {
    const rows = Object.values(agg[c]).filter(r => r.moves.length >= 2).sort((a, b) => b.games - a.games).slice(0, 10);
    if (!rows.length) return `<p class="muted">Not enough games as ${c === 'w' ? 'White' : 'Black'}.</p>`;
    return `<table class="tbl"><thead><tr><th>Line you play</th><th>Games</th><th>Score</th><th>Then usually…</th><th></th></tr></thead><tbody>${rows.map(r => {
      const sc = pct(r.win + r.draw / 2, r.games);
      const ex = Object.entries(r.exits).sort((a, b) => b[1] - a[1])[0];
      const exTxt = ex ? `${ex[0].startsWith('you') ? 'you' : 'they'} leave theory with <b>${esc(ex[0].split('|')[1])}</b>` : '—';
      return `<tr><td><b>${esc(r.opening?.name || 'Unnamed line')}</b><div class="muted small">${esc(fmtLine(r.moves))}</div></td><td>${r.games}</td>
        <td><span style="color:${sc >= 55 ? '#a7dc75' : sc < 45 ? '#f08a7c' : 'inherit'}">${sc}%</span></td><td class="small">${exTxt}</td>
        <td><a class="btn sm primary" href="#/openings?train=line&color=${c}&moves=${encodeURIComponent(r.moves.join(' '))}&name=${encodeURIComponent(r.opening?.name || 'My line')}">Drill</a></td></tr>`;
    }).join('')}</tbody></table>`;
  };
  leaks.sort((a, b) => b.rec.loss - a.rec.loss);
  body.innerHTML = `
    <div class="card"><h2>As White</h2>${section('w')}</div>
    <div class="card"><h2>As Black</h2>${section('b')}</div>
    <div class="card"><h2>Where your openings go wrong</h2>
      <p class="muted">Your biggest mistakes in the first ~15 moves of analysed games.</p>
      ${leaks.length ? leaks.slice(0, 12).map(l => `<div class="insight" style="cursor:pointer" onclick="location.hash='#/review/${encodeURIComponent(l.g.id)}?ply=${l.i + 1}'">${clsIcon(l.rec.cls)}<span><b>${Math.floor(l.i / 2) + 1}${l.i % 2 ? '...' : '.'} ${esc(l.san)}</b> — ${CLS[l.rec.cls].label.toLowerCase()} in the ${esc(l.g.openingBook?.name || l.g.opening || 'opening')} <span class="muted">vs ${esc(l.g.userColor === 'w' ? l.g.black : l.g.white)}, ${fmtDate(l.g.date)}</span></span></div>`).join('')
        : '<p class="muted">No opening mistakes found yet — analyse more games.</p>'}
    </div>`;
}

// ---------------------------------------------------------------- Library
async function renderLibrary(body, params) {
  const lines = await loadLines();
  const fams = {};
  lines.forEach((l, i) => { const f = family(l[1]); (fams[f] = fams[f] || []).push(i); });
  const POPULAR = ['Sicilian Defense', 'French Defense', 'Caro-Kann Defense', 'Italian Game', 'Ruy Lopez', "Queen's Gambit Declined", "Queen's Gambit Accepted", 'Slav Defense', "King's Indian Defense", 'London System', 'English Opening', 'Scandinavian Defense', 'Pirc Defense', 'Nimzo-Indian Defense', 'Scotch Game', 'Vienna Game', 'Dutch Defense', 'Grünfeld Defense'];
  const draw = q => {
    const ql = q.toLowerCase();
    if (params.family && !q) {
      const f = params.family;
      body.innerHTML = `<div class="card"><div class="spread"><h2>${esc(f)}</h2><a class="btn sm" href="#/openings?tab=library">← All openings</a></div>
        <table class="tbl"><tbody>${(fams[f] || []).map(i => lineRow(lines, i)).join('')}</tbody></table></div>`;
      return;
    }
    const names = Object.keys(fams).filter(f => !ql || f.toLowerCase().includes(ql) || fams[f].some(i => lines[i][1].toLowerCase().includes(ql)));
    names.sort((a, b) => (POPULAR.indexOf(b) + 1 ? 1000 - POPULAR.indexOf(b) : 0) - (POPULAR.indexOf(a) + 1 ? 1000 - POPULAR.indexOf(a) : 0) || fams[b].length - fams[a].length);
    $('#lib-list', body).innerHTML = names.slice(0, 120).map(f => `<button class="theme-btn" onclick="location.hash='#/openings?tab=library&family=${encodeURIComponent(f)}'">
      <div class="tn">${esc(f)}</div><div class="ts">${fams[f].length} line${fams[f].length > 1 ? 's' : ''} · ${esc(lines[fams[f][0]][2].split(' ').slice(0, 4).join(' '))}</div></button>`).join('') || '<p class="muted">No openings match.</p>';
  };
  if (params.family) { draw(''); return; }
  body.innerHTML = `<div class="card"><input id="lib-q" placeholder="Search 3,800+ opening lines… (e.g. Najdorf, London, Caro)" style="width:100%;margin-bottom:14px"><div class="theme-grid" id="lib-list"></div></div>`;
  $('#lib-q', body).oninput = e => draw(e.target.value);
  draw('');
}
function lineRow(lines, i) {
  const [eco, name, mv] = lines[i];
  const moves = mv.split(' ');
  const c = sideFor(name);
  return `<tr><td><span class="pill">${eco}</span></td><td><b>${esc(name.split(':').slice(1).join(':').trim() || name)}</b><div class="muted small">${esc(fmtLine(moves))}</div></td>
    <td style="white-space:nowrap"><a class="btn sm" href="#/openings?train=line&mode=learn&color=${c}&moves=${encodeURIComponent(mv)}&name=${encodeURIComponent(name)}">Learn</a>
    <a class="btn sm primary" href="#/openings?train=line&color=${c}&moves=${encodeURIComponent(mv)}&name=${encodeURIComponent(name)}">Drill</a></td></tr>`;
}

// ---------------------------------------------------------------- Repertoire
function renderRep(body) {
  const reps = Object.values(state.repertoire).sort((a, b) => a.due - b.due);
  body.innerHTML = `<div class="card" style="padding:0">${reps.length ? `<table class="tbl"><thead><tr><th>Line</th><th>Side</th><th>Record</th><th>Next review</th><th></th></tr></thead><tbody>${reps.map(r => `<tr>
      <td><b>${esc(r.name)}</b><div class="muted small">${esc(fmtLine(r.moves))}</div></td><td>${r.color === 'w' ? '⚪ White' : '⚫ Black'}</td>
      <td class="muted">${r.reps}✓ ${r.fails}✗ · box ${r.box}</td>
      <td>${r.due <= Date.now() ? '<b style="color:var(--orange)">Due now</b>' : fmtDate(r.due)}</td>
      <td style="white-space:nowrap"><a class="btn sm primary" href="#/openings?train=rep&id=${encodeURIComponent(r.id)}">Drill</a> <button class="btn sm ghost" data-del="${esc(r.id)}">✕</button></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty"><div class="big">📚</div><p>Your repertoire is empty. Drill a line from your games or the library and add it.</p><a class="btn primary" href="#/openings?tab=library">Browse openings</a></div>`}</div>`;
  body.onclick = e => {
    const d = e.target.closest('[data-del]');
    if (d) { delete state.repertoire[d.dataset.del]; save('repertoire'); renderRep(body); }
  };
}

// ---------------------------------------------------------------- Trainer
function renderTrainer(root, params) {
  let queue = [];
  if (params.train === 'due') {
    const all = Object.values(state.repertoire);
    queue = all.filter(r => r.due <= Date.now()).sort((a, b) => a.due - b.due);
    if (!queue.length) queue = [...all].sort((a, b) => a.box - b.box || a.due - b.due).slice(0, 10);
  } else if (params.train === 'rep') {
    const r = state.repertoire[params.id];
    if (r) queue = [r];
  } else {
    const moves = (params.moves || '').split(' ').filter(Boolean);
    const color = params.color || 'w';
    queue = [state.repertoire[lineId(moves, color)] || { id: lineId(moves, color), name: params.name || 'Opening line', moves, color, temp: true }];
  }
  if (!queue.length) { root.innerHTML = `<div class="card empty"><p>Nothing to drill.</p><a class="btn" href="#/openings">Back</a></div>`; return; }

  let qi = 0, line, color, step, fails, mode = params.mode === 'learn' ? 'learn' : 'drill', chess, busy = false, done = false;
  root.innerHTML = `
    <div class="page-head"><div><h1 id="tr-title"></h1><p id="tr-sub" class="muted"></p></div>
      <div class="row"><div class="tabs" style="margin:0;border:none"><button data-m="learn">📖 Learn</button><button data-m="drill">🧠 Drill</button></div><a class="btn" href="#/openings">← Openings</a></div></div>
    <div class="board-layout">
      <div class="board-col"><div id="tr-board"></div></div>
      <div class="side-panel">
        <div class="sec"><div class="puz-status turn" id="tr-status"></div></div>
        <div class="sec"><div class="movelist" id="tr-moves" style="max-height:none"></div></div>
        <div class="sec"><div class="row">
          <button class="btn" id="tr-hint">💡 Show move</button>
          <button class="btn" id="tr-color">⇅ Play other side</button>
          <button class="btn" id="tr-restart">↺ Restart</button>
          <button class="btn primary" id="tr-next" style="margin-left:auto">Next ›</button>
        </div></div>
        <div class="sec" id="tr-after"></div>
      </div>
    </div>`;

  const board = new Board($('#tr-board', root), {
    dests: sq => busy || done ? [] : chess.moves({ square: sq, verbose: true }).map(m => m.to),
    movable: c => c === color && !busy && !done,
    inCheck: f => new Chess(f).inCheck(),
    onMove: (f, t, p) => onMove(f, t, p),
  });
  const status = (cls, html) => { const s = $('#tr-status', root); s.className = 'puz-status ' + cls; s.innerHTML = html; };
  const expectedArrow = () => {
    const c = new Chess(chess.fen());
    const m = c.move(line.moves[step]);
    return [{ from: m.from, to: m.to, color: 'rgba(92,139,176,.85)' }];
  };
  function drawMoves() {
    $('#tr-moves', root).innerHTML = `<div class="small" style="line-height:1.9">${line.moves.map((m, i) => {
      const shown = i < step || (mode === 'learn' && i === step);
      return `${i % 2 === 0 ? `<span class="muted">${i / 2 + 1}.</span> ` : ''}<span style="${i === step ? 'background:#45413b;padding:1px 4px;border-radius:4px' : ''}">${shown ? esc(m) : '?'}</span> `;
    }).join('')}</div>`;
  }
  function start() {
    line = queue[qi];
    color = line.color;
    step = 0; fails = 0; done = false; busy = false;
    chess = new Chess();
    $('#tr-title', root).textContent = line.name;
    $('#tr-sub', root).textContent = `${line.moves.length} moves · you play ${color === 'w' ? 'White' : 'Black'}${queue.length > 1 ? ` · line ${qi + 1} of ${queue.length}` : ''}`;
    root.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('active', b.dataset.m === mode));
    $('#tr-after', root).innerHTML = '';
    board.set({ fen: chess.fen(), orientation: color, lastMove: null, arrows: [], marks: {} });
    advance();
  }
  function advance() {
    drawMoves();
    if (step >= line.moves.length) return finish();
    if (chess.turn() !== color) {
      busy = true;
      status('turn', 'Opponent is moving…');
      setTimeout(() => {
        const m = chess.move(line.moves[step]);
        step++;
        busy = false;
        board.set({ fen: chess.fen(), lastMove: [m.from, m.to], arrows: [], marks: {} });
        advance();
      }, 450);
      return;
    }
    status('turn', `<span class="turn-dot" style="background:${color === 'w' ? '#fff' : '#000'}"></span> ${mode === 'learn' ? `Play <b>${esc(line.moves[step])}</b> (follow the arrow)` : 'Your move — what comes next in this line?'}`);
    board.set({ arrows: mode === 'learn' ? expectedArrow() : [] });
  }
  function onMove(from, to, promo) {
    const before = chess.fen();
    let m;
    try { m = chess.move({ from, to, promotion: promo || 'q' }); } catch { board.render(); return; }
    if (m.san === line.moves[step]) {
      step++;
      board.set({ fen: chess.fen(), lastMove: [from, to], marks: { [to]: 'right' }, arrows: [] });
      advance();
    } else {
      fails++;
      chess.load(before);
      busy = true;
      board.set({ fen: chess.fen(), lastMove: null, marks: { [to]: 'wrong' }, arrows: expectedArrow() });
      status('bad', `✗ ${esc(m.san)} isn't the book move here — it's <b>${esc(line.moves[step])}</b>. Try it.`);
      setTimeout(() => { busy = false; board.set({ marks: {} }); }, 700);
    }
  }
  function finish() {
    done = true;
    const perfect = fails === 0 && mode === 'drill';
    status(perfect ? 'ok' : 'done', perfect ? '✅ Perfect — line played from memory!' : mode === 'learn' ? '📖 Line complete. Now try it in Drill mode!' : `✔ Line complete with ${fails} slip${fails === 1 ? '' : 's'}. It'll come back sooner.`);
    const inRep = !!state.repertoire[line.id];
    if (inRep && mode === 'drill') {
      const r = state.repertoire[line.id];
      if (perfect) { r.reps++; r.box = Math.min(INTERVALS.length - 1, r.box + 1); r.due = Date.now() + INTERVALS[r.box] * DAY; }
      else { r.fails++; r.box = 0; r.due = Date.now() + 10 * 60000; }
      save('repertoire');
    }
    $('#tr-after', root).innerHTML = `<div class="row">
      ${!inRep ? `<button class="btn primary" id="tr-add">＋ Add to my repertoire</button>` : '<span class="muted">In your repertoire ✓</span>'}
      ${mode === 'learn' ? `<button class="btn" id="tr-drill">🧠 Drill it now</button>` : ''}
      <a class="btn ghost" href="#/analysis?fen=${encodeURIComponent(chess.fen())}">Analyse final position</a></div>`;
    $('#tr-add', root)?.addEventListener('click', () => {
      const { temp, ...rest } = line;
      state.repertoire[line.id] = { ...rest, box: perfect ? 1 : 0, due: Date.now() + (perfect ? DAY : 10 * 60000), reps: perfect ? 1 : 0, fails: perfect ? 0 : 1, added: Date.now() };
      save('repertoire');
      toast('Added to your repertoire — it will come back for review.', 'success');
      $('#tr-add', root).outerHTML = '<span class="muted">In your repertoire ✓</span>';
    });
    $('#tr-drill', root)?.addEventListener('click', () => { mode = 'drill'; start(); });
  }

  root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; start(); });
  $('#tr-hint', root).onclick = () => { if (!done && chess.turn() === color) { fails++; board.set({ arrows: expectedArrow() }); } };
  $('#tr-color', root).onclick = () => {
    const c = line.color === 'w' ? 'b' : 'w';
    queue[qi] = state.repertoire[lineId(line.moves, c)] || { id: lineId(line.moves, c), name: line.name, moves: line.moves, color: c, temp: true };
    start();
  };
  $('#tr-restart', root).onclick = start;
  $('#tr-next', root).onclick = () => { if (qi < queue.length - 1) { qi++; start(); } else location.hash = '#/openings?tab=rep'; };
  start();
}
