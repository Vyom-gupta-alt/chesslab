import { Chess } from '../lib.js';
import { Board } from '../board.js';
import { LiveAnalyzer } from '../engine.js';
import { whiteWin, fmtEval, pvToSan, START_FEN } from '../analysis.js';
import { $, esc, toast } from '../ui.js';

let cleanup = [];
export function destroy() { cleanup.forEach(f => f()); cleanup = []; }

export function render(root, params) {
  destroy();
  let startFen = params.fen || START_FEN;
  let fens = [startFen], sans = [], lasts = [null];
  let idx = 0;
  let engineOn = true;
  let lines = [];
  const live = new LiveAnalyzer('live');
  cleanup.push(() => live.stop());

  root.innerHTML = `
  <div class="page-head"><div><h1>Analysis board</h1><p>Play any moves, load a FEN or PGN, and let Stockfish show you the top lines.</p></div></div>
  <div class="board-layout">
    <div class="board-col">
      <div class="board-and-bar">
        <div class="evalbar" id="ab-bar"><div class="w"></div><span class="t top"></span><span class="t bot"></span></div>
        <div id="ab-board"></div>
      </div>
      <div class="nav-btns">
        <button class="btn" data-n="first">⏮</button><button class="btn" data-n="prev">◀</button>
        <button class="btn" data-n="next">▶</button><button class="btn" data-n="last">⏭</button>
        <button class="btn" data-n="flip">⇅</button>
      </div>
    </div>
    <div class="side-panel">
      <div class="sec"><div class="spread"><h3 style="margin:0">Stockfish</h3><label class="check"><input type="checkbox" id="ab-eng" checked> On</label></div>
        <div class="lines" id="ab-lines" style="margin-top:8px"></div></div>
      <div class="sec movelist" id="ab-moves" style="min-height:80px"></div>
      <div class="sec stack">
        <label class="field">FEN<input id="ab-fen" spellcheck="false"></label>
        <div class="row"><button class="btn sm" id="ab-loadfen">Load FEN</button><button class="btn sm" id="ab-reset">New game</button><button class="btn sm" id="ab-undo">Undo</button><button class="btn sm" id="ab-copy">Copy PGN</button></div>
        <label class="field">PGN<textarea id="ab-pgn" style="min-height:80px" placeholder="Paste moves or a full PGN"></textarea></label>
        <div><button class="btn sm" id="ab-loadpgn">Load PGN</button></div>
      </div>
    </div>
  </div>`;

  const fen = () => fens[idx];
  const board = new Board($('#ab-board', root), {
    orientation: fen().split(' ')[1],
    dests: sq => new Chess(fen()).moves({ square: sq, verbose: true }).map(m => m.to),
    inCheck: f => new Chess(f).inCheck(),
    onMove: (from, to, promo) => {
      const c = new Chess(fen());
      let m;
      try { m = c.move({ from, to, promotion: promo || 'q' }); } catch { board.render(); return; }
      fens = fens.slice(0, idx + 1); sans = sans.slice(0, idx); lasts = lasts.slice(0, idx + 1);
      fens.push(c.fen()); sans.push(m.san); lasts.push([from, to]);
      idx++;
      update();
    },
  });

  function bar(ev) {
    const el = $('#ab-bar', root);
    const w = ev ? whiteWin(ev) : 50;
    el.classList.toggle('flip', board.orientation === 'b');
    el.querySelector('.w').style.height = w + '%';
    const txt = ev ? fmtEval(ev).replace('+', '') : '';
    const atBottomWhite = board.orientation === 'w';
    const top = el.querySelector('.top'), bot = el.querySelector('.bot');
    top.textContent = (w >= 50) !== atBottomWhite ? txt : '';
    bot.textContent = (w >= 50) === atBottomWhite ? txt : '';
    top.style.color = atBottomWhite ? '#f1f1f1' : '#333';
    bot.style.color = atBottomWhite ? '#333' : '#f1f1f1';
  }

  function drawLines() {
    const el = $('#ab-lines', root);
    if (!engineOn) { el.innerHTML = '<p class="muted small">Engine off</p>'; return; }
    const c = new Chess(fen());
    if (c.isGameOver()) { el.innerHTML = `<p class="muted">${c.isCheckmate() ? 'Checkmate' : 'Draw'}</p>`; return; }
    el.innerHTML = lines.length ? lines.map(l => {
      const neg = l.score.mate != null ? l.score.mate < 0 : l.score.cp < 0;
      return `<div class="ln"><span class="ev ${neg ? 'neg' : ''}">${fmtEval(l.score)}</span><span class="pv">${esc(pvToSan(fen(), l.pv, 10))}</span></div>`;
    }).join('') + `<p class="muted small" style="margin:6px 0 0">Depth ${lines[0].depth}</p>` : '<p class="muted small">Thinking…</p>';
  }

  function drawMoves() {
    const n0 = +fen0().split(' ')[5];
    const blackFirst = fen0().split(' ')[1] === 'b';
    let html = '', i = 0, n = n0;
    const cell = j => j < sans.length ? `<span class="mv ${idx === j + 1 ? 'cur' : ''}" data-i="${j + 1}">${sans[j]}</span>` : '<span></span>';
    if (blackFirst && sans.length) { html += `<div class="mrow"><span class="mn">${n}.</span><span class="mv">…</span>${cell(0)}</div>`; i = 1; n++; }
    for (; i < sans.length; i += 2, n++) html += `<div class="mrow"><span class="mn">${n}.</span>${cell(i)}${cell(i + 1)}</div>`;
    $('#ab-moves', root).innerHTML = html || '<p class="muted small">Make a move on the board.</p>';
  }
  const fen0 = () => fens[0];

  function update() {
    lines = [];
    const arrows = [];
    board.set({ fen: fen(), lastMove: lasts[idx], arrows });
    $('#ab-fen', root).value = fen();
    drawMoves(); drawLines(); bar(null);
    const c = new Chess(fen());
    if (!engineOn || c.isGameOver()) { live.stop(); return; }
    let t = 0;
    const thisFen = fen();
    live.start(thisFen, {
      multipv: 3, maxDepth: 22, onInfo: ls => {
        if (thisFen !== fen()) return;
        lines = ls;
        const now = Date.now();
        if (now - t < 200) return;
        t = now;
        drawLines();
        bar(ls[0]?.score);
        const b = ls[0]?.pv?.[0];
        board.set({ arrows: b ? [{ from: b.slice(0, 2), to: b.slice(2, 4), color: 'rgba(92,139,176,.85)' }] : [] });
      },
    });
  }

  const nav = n => {
    if (n === 'first') idx = 0; else if (n === 'prev') idx = Math.max(0, idx - 1);
    else if (n === 'next') idx = Math.min(fens.length - 1, idx + 1); else if (n === 'last') idx = fens.length - 1;
    else if (n === 'flip') { board.flip(); bar(lines[0]?.score); return; }
    update();
  };
  $('.nav-btns', root).onclick = e => { const b = e.target.closest('[data-n]'); if (b) nav(b.dataset.n); };
  $('#ab-moves', root).onclick = e => { const m = e.target.closest('[data-i]'); if (m) { idx = +m.dataset.i; update(); } };
  const onKey = e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') nav('prev'); else if (e.key === 'ArrowRight') nav('next');
  };
  window.addEventListener('keydown', onKey);
  cleanup.push(() => window.removeEventListener('keydown', onKey));

  $('#ab-eng', root).onchange = e => { engineOn = e.target.checked; if (!engineOn) { live.stop(); board.set({ arrows: [] }); } update(); };
  const reset = f => { startFen = f; fens = [f]; sans = []; lasts = [null]; idx = 0; update(); };
  $('#ab-reset', root).onclick = () => reset(START_FEN);
  $('#ab-undo', root).onclick = () => { if (idx > 0) { fens = fens.slice(0, idx); sans = sans.slice(0, idx - 1); lasts = lasts.slice(0, idx); idx--; update(); } };
  $('#ab-loadfen', root).onclick = () => {
    const f = $('#ab-fen', root).value.trim();
    try { new Chess(f); reset(f); } catch { toast('Invalid FEN', 'error'); }
  };
  $('#ab-loadpgn', root).onclick = () => {
    const txt = $('#ab-pgn', root).value.trim();
    try {
      const c = new Chess();
      c.loadPgn(txt);
      const h = c.getHeaders ? c.getHeaders() : c.header();
      const r = new Chess(h.FEN || START_FEN);
      fens = [r.fen()]; sans = []; lasts = [null];
      for (const m of c.history({ verbose: true })) { const mm = r.move(m.san); fens.push(r.fen()); sans.push(mm.san); lasts.push([mm.from, mm.to]); }
      idx = fens.length - 1;
      update();
    } catch (e) { toast('Could not read PGN: ' + e.message, 'error'); }
  };
  $('#ab-copy', root).onclick = () => {
    const c = new Chess(fen0());
    for (const s of sans) c.move(s);
    navigator.clipboard?.writeText(c.pgn()).then(() => toast('PGN copied', 'success'), () => toast('Copy failed', 'error'));
  };

  update();
}
