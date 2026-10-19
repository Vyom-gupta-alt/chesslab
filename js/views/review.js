import { state, openingName } from '../store.js';
import { Chess } from '../lib.js';
import { Board } from '../board.js';
import { analyzer } from '../analyzer.js';
import { playedRating, verdict } from '../perf.js';
import { LiveAnalyzer } from '../engine.js';
import { parseGame, whiteWin, fmtEval, moveComment, coachExplain, pvToSan, uciToSan, moverWin } from '../analysis.js';
import { $, $$, esc, fmtDate, cap, CLS, CLS_ORDER, clsIcon, toast } from '../ui.js';

let cleanup = [];
const GOODISH = new Set(['brilliant', 'great', 'best', 'excellent', 'book', 'forced']);
const SHOW_ICON = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder', 'book']);
const fmtClock = s => s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function destroy() { cleanup.forEach(f => f()); cleanup = []; }

export function render(root, params) {
  destroy();
  const g = state.games[params.id];
  if (!g) { root.innerHTML = `<div class="card empty"><p>Game not found.</p><a class="btn" href="#/games">Back to games</a></div>`; return; }
  let P;
  try { P = parseGame(g.pgn); } catch (e) { root.innerHTML = `<div class="card"><h2>Couldn't read this game</h2><p class="muted">${esc(e.message)}</p></div>`; return; }
  const N = P.moves.length;
  const A = () => g.analysis;
  let ply = params.ply != null ? Math.min(N, +params.ply) : 0;
  let variation = null; // { start, fens:[], sans:[], last:[from,to] }
  let retry = null;     // { i, tries, marks }
  let liveLines = [];
  const live = new LiveAnalyzer('live');
  cleanup.push(() => live.stop());

  const tcBase = +(g.timeControl || '').split('+')[0] || null;

  root.innerHTML = `
  <div class="page-head">
    <div><h1>Game review</h1><p>${esc(g.white)} (${g.whiteElo ?? '?'}) vs ${esc(g.black)} (${g.blackElo ?? '?'}) · ${esc(g.result)} · ${fmtDate(g.date)} · ${cap(g.timeClass || '')}${openingName(g) ? ' · ' + esc(openingName(g)) : ''}</p></div>
    <div class="row">${g.url ? `<a class="btn" href="${esc(g.url)}" target="_blank" rel="noopener">Open on ${g.source === 'chesscom' ? 'Chess.com' : g.source === 'lichess' ? 'Lichess' : 'site'} ↗</a>` : ''}<a class="btn" href="#/games">← Games</a></div>
  </div>
  <div class="board-layout">
    <div class="board-col">
      <div class="player-strip" id="ps-top"></div>
      <div class="board-and-bar">
        <div class="evalbar" id="rv-bar"><div class="w"></div><span class="t top"></span><span class="t bot"></span></div>
        <div id="rv-board"></div>
      </div>
      <div class="player-strip" id="ps-bot"></div>
      <div class="nav-btns">
        <button class="btn" data-nav="first" title="Start (Home)">⏮</button>
        <button class="btn" data-nav="prev" title="Previous (←)">◀</button>
        <button class="btn" data-nav="next" title="Next (→)">▶</button>
        <button class="btn" data-nav="last" title="End (End)">⏭</button>
        <button class="btn" data-nav="flip" title="Flip board (F)">⇅</button>
      </div>
    </div>
    <div class="side-panel">
      <div class="sec" id="rv-head"></div>
      <div class="sec" id="rv-comment"></div>
      <div class="sec" id="rv-graph-sec"><svg class="evalgraph" id="rv-graph" viewBox="0 0 1000 100" preserveAspectRatio="none"></svg></div>
      <div class="sec movelist" id="rv-moves"></div>
      <div class="sec" id="rv-counts"></div>
    </div>
  </div>`;

  const chessCache = new Map();
  const chessAt = fen => { if (!chessCache.has(fen)) chessCache.set(fen, new Chess(fen)); return chessCache.get(fen); };
  const curFen = () => retry ? P.moves[retry.i].fenBefore : variation ? variation.fens.at(-1) : P.fens[ply];

  const board = new Board($('#rv-board', root), {
    orientation: g.userColor || 'w',
    dests: sq => chessAt(curFen()).moves({ square: sq, verbose: true }).map(m => m.to),
    inCheck: fen => chessAt(fen).inCheck(),
    onMove: (from, to, promo) => onUserMove(from, to, promo),
  });

  function onUserMove(from, to, promo) {
    const fen = curFen();
    const c = new Chess(fen);
    let m;
    try { m = c.move({ from, to, promotion: promo || 'q' }); } catch { board.render(); return; }
    const uci = m.from + m.to + (m.promotion || '');
    if (retry) {
      const pos = A().positions[retry.i];
      const color = P.moves[retry.i].color;
      const ok = uci === pos.best || (pos.second && uci === pos.second.move && moverWin(pos.second.eval, color) >= moverWin(pos.eval, color) - 3);
      if (ok) {
        board.set({ fen: c.fen(), lastMove: [from, to], marks: { [to]: 'right' }, arrows: [] });
        retry.solved = true;
        drawComment();
        setTimeout(() => { if (retry?.solved) { retry = null; update(); } }, 1600);
      } else {
        retry.tries++;
        board.set({ fen: c.fen(), lastMove: [from, to], marks: { [to]: 'wrong' }, arrows: [] });
        drawComment(`<b>${m.san}</b> isn't it. ${retry.tries >= 2 ? 'Hint: look at the highlighted piece.' : 'Try again!'}`);
        setTimeout(() => { if (retry) update(); }, 700);
      }
      return;
    }
    if (!variation && ply < N && P.moves[ply].uci === uci) { ply++; update(); return; }
    if (!variation) variation = { start: ply, fens: [fen], sans: [] };
    variation.fens.push(c.fen());
    variation.sans.push(m.san);
    variation.last = [from, to];
    update();
  }

  function go(to) {
    if (retry) retry = null;
    if (variation) {
      if (to === 'prev') { variation.fens.pop(); variation.sans.pop(); if (!variation.sans.length) { ply = variation.start; variation = null; } update(); return; }
      ply = variation.start; variation = null;
      if (to !== 'next') { /* fall through */ } else { update(); return; }
    }
    if (to === 'first') ply = 0;
    else if (to === 'prev') ply = Math.max(0, ply - 1);
    else if (to === 'next') ply = Math.min(N, ply + 1);
    else if (to === 'last') ply = N;
    else if (typeof to === 'number') ply = Math.max(0, Math.min(N, to));
    update();
  }

  $('.nav-btns', root).onclick = e => {
    const b = e.target.closest('[data-nav]');
    if (!b) return;
    if (b.dataset.nav === 'flip') { board.flip(); drawStrips(); drawBar(); } else go(b.dataset.nav);
  };
  const onKey = e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') { go('prev'); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go('next'); e.preventDefault(); }
    else if (e.key === 'Home') go('first');
    else if (e.key === 'End') go('last');
    else if (e.key === 'f') { board.flip(); drawStrips(); drawBar(); }
  };
  window.addEventListener('keydown', onKey);
  cleanup.push(() => window.removeEventListener('keydown', onKey));

  // ---------- drawing ----------
  function evalNow() {
    if (variation) return liveLines[0]?.score || null;
    return A()?.positions[ply]?.eval || null;
  }
  function drawBar() {
    const ev = evalNow();
    const bar = $('#rv-bar', root);
    const w = ev ? whiteWin(ev) : 50;
    bar.classList.toggle('flip', board.orientation === 'b');
    bar.querySelector('.w').style.height = w + '%';
    const txt = ev ? fmtEval(ev).replace('+', '') : '';
    const whiteAhead = w >= 50;
    const top = bar.querySelector('.top'), bot = bar.querySelector('.bot');
    const whiteAtBottom = board.orientation === 'w';
    top.textContent = (whiteAhead !== whiteAtBottom) ? txt : '';
    bot.textContent = (whiteAhead === whiteAtBottom) ? txt : '';
    top.style.color = whiteAtBottom ? '#f1f1f1' : '#333';
    bot.style.color = whiteAtBottom ? '#333' : '#f1f1f1';
  }
  function clockFor(color) {
    if (!P.clocks.length) return null;
    for (let j = Math.min(ply, N) - 1; j >= 0; j--) if (P.moves[j].color === color) return P.clocks[j];
    return tcBase;
  }
  function drawStrips() {
    const strip = c => `<span>${c === 'w' ? '⚪' : '⚫'} ${esc(c === 'w' ? g.white : g.black)} <span class="elo">(${(c === 'w' ? g.whiteElo : g.blackElo) ?? '?'})</span></span>${P.clocks.length ? `<span class="clk">${fmtClock(clockFor(c))}</span>` : ''}`;
    const bottom = board.orientation;
    $('#ps-bot', root).innerHTML = strip(bottom);
    $('#ps-top', root).innerHTML = strip(bottom === 'w' ? 'b' : 'w');
  }

  function drawHead() {
    const head = $('#rv-head', root);
    const a = A();
    if (!a) {
      const running = analyzer.running === g.id, queued = analyzer.queue.includes(g.id);
      head.innerHTML = `<h3>Not analysed yet</h3>
        <p class="muted" style="margin:0 0 10px">Stockfish will grade every move, compute accuracy and build puzzles from your mistakes.</p>
        ${running || queued ? `<div class="bar"><i id="rv-prog" style="width:${Math.round(analyzer.progress * 100 * (running ? 1 : 0))}%"></i></div><p class="muted small" id="rv-prog-t">${running ? 'Analysing…' : 'Queued…'}</p>`
          : `<button class="btn primary lg" id="rv-analyse" style="width:100%">⚡ Analyse this game</button>`}`;
      const b = $('#rv-analyse', root);
      if (b) b.onclick = () => { analyzer.add([g.id], true); drawHead(); };
      return;
    }
    const nPuz = Object.values(state.puzzles).filter(p => p.gameId === g.id).length;
    const box = c => `<div class="acc-box ${c}"><div class="who">${esc(c === 'w' ? g.white : g.black)}${g.userColor === c ? ' (you)' : ''}</div><div class="n">${a.accuracy[c] ?? '—'}</div><div class="muted small">accuracy</div></div>`;
    const pa = g.platformAccuracy;
    const pr = playedRating(g);
    head.innerHTML = `<div class="acc-row">${box('w')}<div class="muted">vs</div>${box('b')}</div>
      ${pr ? `<div style="margin-top:12px;padding:10px 12px;background:var(--bg2);border-radius:8px;line-height:1.5">
        <div class="spread"><span>🔥 You played like a <b style="font-size:18px">${pr.rating}</b></span>${pr.delta != null ? `<b style="color:${pr.delta >= 100 ? '#a7dc75' : pr.delta > -100 ? 'var(--text)' : pr.delta > -300 ? 'var(--orange)' : 'var(--red)'}">${pr.delta > 0 ? '+' : ''}${pr.delta} vs ${pr.actual}</b>` : ''}</div>
        <div class="muted small" style="margin-top:4px">${esc(verdict(pr))}</div></div>` : ''}
      ${pa && (pa.white || pa.black) ? `<p class="muted small" style="text-align:center;margin:8px 0 0">${g.source === 'chesscom' ? 'Chess.com' : 'Lichess'} reported: ${pa.white ?? '—'} / ${pa.black ?? '—'}</p>` : ''}
      <div class="row" style="margin-top:12px;justify-content:center">
        ${nPuz ? `<a class="btn primary sm" href="#/puzzles?mode=game&id=${encodeURIComponent(g.id)}">🧩 Practise my ${nPuz} mistake${nPuz > 1 ? 's' : ''}</a>` : ''}
        <button class="btn sm" id="rv-reanalyse" title="Depth ${a.depth}">↻ Re-analyse</button>
      </div>`;
    $('#rv-reanalyse', root).onclick = () => { g.analysis = null; analyzer.add([g.id], true); drawAll(); };
  }

  function drawCounts() {
    const a = A();
    const el = $('#rv-counts', root);
    if (!a) { el.innerHTML = ''; return; }
    el.innerHTML = `<table class="cls-table">${CLS_ORDER.map(k => `<tr>
      <td class="n" style="color:${CLS[k].color}">${a.counts.w[k] || 0}</td>
      <td class="lbl">${clsIcon(k)} ${CLS[k].label}</td>
      <td class="n" style="color:${CLS[k].color}">${a.counts.b[k] || 0}</td></tr>`).join('')}</table>`;
  }

  function drawComment(override) {
    const el = $('#rv-comment', root);
    const a = A();
    if (retry) {
      const m = P.moves[retry.i];
      const side = m.color === 'w' ? 'White' : 'Black';
      el.innerHTML = retry.solved
        ? `<div class="comment">${clsIcon('best')}<div class="txt"><b>Correct!</b> That's the move. 🎉</div></div>`
        : `<div class="comment"><span class="ci" style="background:var(--blue)">?</span><div class="txt">${override || `Find a better move for <b>${side}</b> instead of ${m.san}.`}</div></div>
           <div class="row" style="margin-top:10px"><button class="btn sm" id="rv-giveup">Show me</button><button class="btn sm ghost" id="rv-cancel">Cancel</button></div>`;
      $('#rv-giveup', root)?.addEventListener('click', () => {
        const best = a.positions[retry.i].best;
        board.set({ arrows: [{ from: best.slice(0, 2), to: best.slice(2, 4), color: 'rgba(129,182,76,.9)' }] });
        el.querySelector('.txt').innerHTML = `The best move was <b>${uciToSan(m.fenBefore, best)}</b>.`;
      });
      $('#rv-cancel', root)?.addEventListener('click', () => { retry = null; update(); });
      return;
    }
    if (variation) {
      const startFen = variation.fens[0];
      let line = '';
      const c = new Chess(startFen);
      let n = +startFen.split(' ')[5];
      variation.sans.forEach((s, i) => {
        const t = c.turn();
        c.move(s);
        line += t === 'w' ? `${n}. ${s} ` : (i === 0 ? `${n}... ${s} ` : `${s} `);
        if (t === 'b') n++;
      });
      el.innerHTML = `<div class="spread"><h3 style="margin:0">Exploring a variation</h3><button class="btn sm" id="rv-back">↩ Back to game</button></div>
        <p class="muted" style="margin:8px 0">${esc(line)}</p>
        <div class="lines" id="rv-lines">${linesHtml()}</div>`;
      $('#rv-back', root).onclick = () => { ply = variation.start; variation = null; update(); };
      return;
    }
    if (ply === 0) {
      const mine = a ? P.moves.map((m, i) => ({ m, i, rec: a.moves[i] })).filter(x => (!g.userColor || x.m.color === g.userColor) && ['blunder', 'mistake', 'miss'].includes(x.rec.cls)) : [];
      el.innerHTML = `<h3>Key moments</h3>${!a ? '<p class="muted">Analyse the game to see key moments.</p>'
        : mine.length ? `<div class="stack">${mine.slice(0, 8).map(x => `<div class="row" style="cursor:pointer" data-jump="${x.i + 1}">${clsIcon(x.rec.cls)} <span><b>${Math.floor(x.i / 2) + 1}${x.m.color === 'w' ? '.' : '...'} ${x.m.san}</b> <span class="muted">— ${CLS[x.rec.cls].label.toLowerCase()} (${x.rec.phase})</span></span></div>`).join('')}</div>`
          : '<p class="muted">No mistakes or blunders — great game! 🎉</p>'}
        <p class="muted small" style="margin-top:10px">Tip: use ← → keys. Move pieces on the board to explore your own ideas.</p>`;
      el.onclick = e => { const j = e.target.closest('[data-jump]'); if (j) go(+j.dataset.jump); };
      return;
    }
    el.onclick = null;
    const i = ply - 1, m = P.moves[i];
    if (!a) {
      el.innerHTML = `<div class="comment"><div class="txt"><b>${Math.floor(i / 2) + 1}${m.color === 'w' ? '.' : '...'} ${m.san}</b>${P.spent[i] != null ? ` <span class="muted small">· ${P.spent[i].toFixed(1)}s</span>` : ''}</div></div>`;
      return;
    }
    const rec = a.moves[i], pb = a.positions[i], pa = a.positions[i + 1];
    const canRetry = ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(rec.cls) && pb.best;
    el.innerHTML = `<div class="comment">${clsIcon(rec.cls)}<div class="txt">${moveComment(m, rec, pb, pa)}
        <div class="muted small" style="margin-top:6px">Eval ${fmtEval(pa.eval)}${P.spent[i] != null ? ` · ${P.spent[i].toFixed(1)}s spent` : ''} · ${rec.phase}</div></div></div>
      ${canRetry ? `<div class="row" style="margin-top:10px"><button class="btn sm primary" id="rv-why">🧑‍🏫 Why was ${esc(m.san)} bad?</button><button class="btn sm" id="rv-retry">↻ Retry this move</button><button class="btn sm" id="rv-showline">Show best line</button></div><div class="muted small" id="rv-line" style="margin-top:8px"></div><div id="rv-coach"></div>` : ''}`;
    $('#rv-why', root)?.addEventListener('click', () => {
      const pts = coachExplain(m, rec, pb, pa, P.spent[i]);
      $('#rv-coach', root).innerHTML = `<div class="card" style="background:var(--bg2);margin-top:10px;padding:12px"><b>🧑‍🏫 Coach</b>${pts.map(p => `<p style="margin:8px 0 0;line-height:1.5">${p}</p>`).join('')}</div>`;
    });
    $('#rv-retry', root)?.addEventListener('click', () => { retry = { i, tries: 0 }; update(); });
    $('#rv-showline', root)?.addEventListener('click', () => { $('#rv-line', root).textContent = pvToSan(m.fenBefore, pb.pv, 10); });
  }

  function linesHtml() {
    if (!liveLines.length) return '<p class="muted small">Engine thinking…</p>';
    const fen = curFen();
    return liveLines.map(l => {
      const neg = l.score.mate != null ? l.score.mate < 0 : l.score.cp < 0;
      return `<div class="ln"><span class="ev ${neg ? 'neg' : ''}">${fmtEval(l.score)}</span><span class="pv">${esc(pvToSan(fen, l.pv, 8))}</span></div>`;
    }).join('') + `<p class="muted small" style="margin:6px 0 0">Depth ${liveLines[0].depth}</p>`;
  }

  function drawGraph() {
    const svg = $('#rv-graph', root);
    const a = A();
    if (!a) { $('#rv-graph-sec', root).style.display = 'none'; return; }
    $('#rv-graph-sec', root).style.display = '';
    const pts = a.positions.map((p, i) => [N ? (i / N) * 1000 : 0, 100 - whiteWin(p.eval)]);
    const area = `M0,100 ${pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L1000,100 Z`;
    let dots = '';
    a.moves.forEach((rec, i) => {
      if (!['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(rec.cls)) return;
      const [x, y] = pts[i + 1];
      dots += `<circle cx="${x}" cy="${y}" r="4" fill="${CLS[rec.cls].color}" vector-effect="non-scaling-stroke"/>`;
    });
    const cx = N ? (ply / N) * 1000 : 0;
    svg.innerHTML = `<path d="${area}" fill="#f1f1f1"/><line x1="0" y1="50" x2="1000" y2="50" stroke="#888" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".5"/>
      ${dots}<line x1="${cx}" y1="0" x2="${cx}" y2="100" stroke="#5c8bb0" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  }
  $('#rv-graph', root).addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    go(Math.round(((e.clientX - r.left) / r.width) * N));
  });

  function drawMoves() {
    const a = A();
    let html = '';
    const startBlack = P.moves[0]?.color === 'b';
    let n = +(P.start.split(' ')[5] || 1);
    let i = 0;
    const cell = j => {
      if (j >= N) return '<span></span>';
      const rec = a?.moves[j];
      const icon = rec && SHOW_ICON.has(rec.cls) ? clsIcon(rec.cls) : '';
      const t = P.spent[j] != null ? `<span class="tm">${P.spent[j] < 10 ? P.spent[j].toFixed(1) : Math.round(P.spent[j])}s</span>` : '';
      return `<span class="mv${ply === j + 1 && !variation ? ' cur' : ''}" data-ply="${j + 1}">${icon}<span>${P.moves[j].san}</span>${t}</span>`;
    };
    if (startBlack) { html += `<div class="mrow"><span class="mn">${n}.</span><span class="mv">…</span>${cell(0)}</div>`; i = 1; n++; }
    for (; i < N; i += 2, n++) html += `<div class="mrow"><span class="mn">${n}.</span>${cell(i)}${cell(i + 1)}</div>`;
    const el = $('#rv-moves', root);
    el.innerHTML = html || '<p class="muted">No moves.</p>';
    const cur = el.querySelector('.cur');
    if (cur) {
      const top = cur.offsetTop - el.offsetTop;
      if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 30) el.scrollTop = top - el.clientHeight / 2;
    }
  }
  $('#rv-moves', root).addEventListener('click', e => { const mv = e.target.closest('[data-ply]'); if (mv) go(+mv.dataset.ply); });

  function drawBoard() {
    const a = A();
    if (retry) {
      const prev = retry.i > 0 ? [P.moves[retry.i - 1].from, P.moves[retry.i - 1].to] : null;
      const best = a.positions[retry.i].best;
      board.set({ fen: P.moves[retry.i].fenBefore, lastMove: prev, arrows: [], badge: null, marks: retry.tries >= 2 ? { [best.slice(0, 2)]: 'hint' } : {} });
      return;
    }
    if (variation) {
      const arrows = liveLines[0]?.pv?.[0] ? [{ from: liveLines[0].pv[0].slice(0, 2), to: liveLines[0].pv[0].slice(2, 4), color: 'rgba(92,139,176,.85)' }] : [];
      board.set({ fen: curFen(), lastMove: variation.last, arrows, badge: null, marks: {} });
      return;
    }
    const m = P.moves[ply - 1];
    let arrows = [], badge = null;
    if (a && m) {
      const rec = a.moves[ply - 1], pb = a.positions[ply - 1];
      badge = { sq: m.to, cls: rec.cls };
      if (!GOODISH.has(rec.cls) && pb.best) arrows.push({ from: pb.best.slice(0, 2), to: pb.best.slice(2, 4), color: 'rgba(129,182,76,.85)' });
    }
    board.set({ fen: P.fens[ply], lastMove: m ? [m.from, m.to] : null, arrows, badge, marks: {} });
  }

  let lastLiveFen = null;
  function runLive() {
    const fen = variation ? curFen() : null;
    if (fen === lastLiveFen) return;
    lastLiveFen = fen;
    liveLines = [];
    if (!fen) { live.stop(); return; }
    let t = 0;
    live.start(fen, {
      multipv: 3, maxDepth: 20, onInfo: lines => {
        liveLines = lines;
        const now = Date.now();
        if (now - t < 250) return;
        t = now;
        const el = $('#rv-lines', root);
        if (el) el.innerHTML = linesHtml();
        drawBar();
        drawBoard();
      },
    });
  }

  function update() {
    drawBoard(); drawBar(); drawStrips(); drawComment(); drawGraph(); drawMoves(); runLive();
  }
  function drawAll() { drawHead(); drawCounts(); update(); }

  const onUpd = e => {
    if (e.detail.running === g.id) {
      const p = $('#rv-prog', root), t = $('#rv-prog-t', root);
      if (p) p.style.width = Math.round(e.detail.progress * 100) + '%'; else drawHead();
      if (t) t.textContent = `Analysing… ${Math.round(e.detail.progress * 100)}%`;
    }
  };
  const onDone = e => { if (e.detail.id === g.id) { drawAll(); toast('Analysis complete', 'success'); } };
  analyzer.events.addEventListener('update', onUpd);
  analyzer.events.addEventListener('gameDone', onDone);
  cleanup.push(() => { analyzer.events.removeEventListener('update', onUpd); analyzer.events.removeEventListener('gameDone', onDone); });

  drawAll();
}
