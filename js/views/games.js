import { state, allGames, userResult, save, openingName } from '../store.js';
import { analyzer } from '../analyzer.js';
import { $, esc, fmtDate, toast, cap, confirmBox } from '../ui.js';
import { userAcc } from '../stats.js';

let off = null;

export function render(root) {
  const f = { q: '', source: '', tc: '', result: '', status: '' };
  let limit = 50;
  root.innerHTML = `
  <div class="page-head">
    <div><h1>My games</h1><p id="g-sub"></p></div>
    <div class="row">
      <button class="btn" id="g-an-all">Analyse all unanalysed</button>
      <a class="btn primary" href="#/import">+ Import games</a>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="row">
      <input id="f-q" placeholder="Search opponent or opening…" style="flex:1;min-width:200px">
      <select id="f-source"><option value="">All sites</option><option value="chesscom">Chess.com</option><option value="lichess">Lichess</option><option value="pgn">PGN</option></select>
      <select id="f-tc"><option value="">All time controls</option><option>bullet</option><option>blitz</option><option>rapid</option><option>classical</option><option>daily</option></select>
      <select id="f-result"><option value="">All results</option><option value="win">Wins</option><option value="loss">Losses</option><option value="draw">Draws</option></select>
      <select id="f-status"><option value="">Analysed + not</option><option value="done">Analysed</option><option value="todo">Not analysed</option></select>
    </div>
  </div>
  <div class="card" style="padding:0"><div class="table-wrap" id="g-table"></div></div>`;

  const filtered = () => allGames().filter(g => {
    if (f.source && g.source !== f.source) return false;
    if (f.tc && g.timeClass !== f.tc) return false;
    if (f.result && userResult(g) !== f.result) return false;
    if (f.status === 'done' && !g.analysis) return false;
    if (f.status === 'todo' && g.analysis) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (![g.white, g.black, openingName(g), g.eco].some(x => x && x.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const draw = () => {
    const list = filtered();
    $('#g-sub', root).textContent = `${list.length} game${list.length === 1 ? '' : 's'} · ${list.filter(g => g.analysis).length} analysed`;
    if (!allGames().length) {
      $('#g-table', root).innerHTML = `<div class="empty"><div class="big">♟</div><p>No games yet.</p><a class="btn primary" href="#/import">Import from Chess.com or Lichess</a></div>`;
      return;
    }
    const rows = list.slice(0, limit).map(g => {
      const res = userResult(g);
      const opp = g.userColor === 'w' ? `${g.black} (${g.blackElo ?? '?'})` : g.userColor === 'b' ? `${g.white} (${g.whiteElo ?? '?'})` : `${g.white} vs ${g.black}`;
      const acc = userAcc(g);
      const running = analyzer.running === g.id;
      const queued = analyzer.queue.includes(g.id);
      const status = g.analysis ? `<b>${acc != null ? acc.toFixed(1) + '%' : `${g.analysis.accuracy.w}/${g.analysis.accuracy.b}`}</b>`
        : running ? `<span class="muted">${Math.round(analyzer.progress * 100)}%</span>`
          : queued ? '<span class="muted">Queued</span>' : `<button class="btn sm" data-an="${g.id}">Analyse</button>`;
      return `<tr class="click" data-id="${g.id}">
        <td><span class="pill">${g.source === 'chesscom' ? 'Chess.com' : g.source === 'lichess' ? 'Lichess' : 'PGN'}</span></td>
        <td class="muted">${fmtDate(g.date)}</td>
        <td>${g.userColor ? `<span title="You played ${g.userColor === 'w' ? 'White' : 'Black'}">${g.userColor === 'w' ? '⚪' : '⚫'}</span> ` : ''}${esc(opp)}</td>
        <td>${res ? `<span class="pill ${res}">${cap(res)}</span>` : `<span class="pill">${esc(g.result)}</span>`}</td>
        <td class="muted">${cap(g.timeClass || '')}</td>
        <td class="muted" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(openingName(g) || '')}">${esc(openingName(g) || g.eco || '')}</td>
        <td>${status}</td>
        <td><button class="btn sm ghost" data-del="${g.id}" title="Remove">✕</button></td>
      </tr>`;
    }).join('');
    $('#g-table', root).innerHTML = `<table class="tbl"><thead><tr><th>Site</th><th>Date</th><th>Opponent</th><th>Result</th><th>Type</th><th>Opening</th><th>Accuracy</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      ${list.length > limit ? `<div style="padding:14px;text-align:center"><button class="btn" id="g-more">Show more (${list.length - limit} left)</button></div>` : ''}`;
    const more = $('#g-more', root);
    if (more) more.onclick = () => { limit += 100; draw(); };
  };

  $('#g-table', root).onclick = async e => {
    const an = e.target.closest('[data-an]');
    if (an) { e.stopPropagation(); analyzer.add([an.dataset.an]); draw(); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      if (await confirmBox('Remove this game from your library?', 'Remove')) {
        delete state.games[del.dataset.del]; save('games'); draw();
      }
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = '#/review/' + encodeURIComponent(tr.dataset.id);
  };
  for (const k of ['q', 'source', 'tc', 'result', 'status']) {
    const el = $('#f-' + k, root);
    el.addEventListener(k === 'q' ? 'input' : 'change', () => { f[k] = el.value; limit = 50; draw(); });
  }
  $('#g-an-all', root).onclick = () => {
    const ids = filtered().filter(g => !g.analysis).map(g => g.id);
    if (!ids.length) return toast('Everything here is already analysed', 'info');
    analyzer.add(ids);
    toast(`Queued ${ids.length} game${ids.length > 1 ? 's' : ''} for analysis`, 'success');
    draw();
  };

  let t = 0;
  off = () => analyzer.events.removeEventListener('update', onUpd);
  const onUpd = () => { const now = Date.now(); if (now - t > 700) { t = now; draw(); } };
  analyzer.events.addEventListener('update', onUpd);
  analyzer.events.addEventListener('gameDone', draw, { once: false });
  const prevOff = off;
  off = () => { prevOff(); analyzer.events.removeEventListener('gameDone', draw); };
  draw();
}

export function destroy() { off?.(); off = null; }
