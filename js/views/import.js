import { state, save, addGames } from '../store.js';
import { importChessCom, importLichess, importPgnText } from '../importers.js';
import { parseGame } from '../analysis.js';
import { analyzer } from '../analyzer.js';
import { $, $$, esc, toast } from '../ui.js';

export function render(root, params) {
  const s = state.settings;
  root.innerHTML = `
  <div class="page-head"><div><h1>Import games</h1><p>Pull your games straight from Chess.com or Lichess — just type a username. No downloading needed.</p></div></div>
  <div class="tabs" id="imp-tabs">
    <button data-t="chesscom" class="active">Chess.com</button>
    <button data-t="lichess">Lichess</button>
    <button data-t="pgn">Paste PGN</button>
  </div>
  <div class="grid g2">
    <div class="card" id="imp-panel"></div>
    <div class="card">
      <h2>How it works</h2>
      <div class="stack muted" style="line-height:1.55">
        <p>1. Enter your username and choose how many games to import. Games come directly from the official public APIs.</p>
        <p>2. Tick <b>“Remember username”</b> and ChessLab will auto-sync your new games every time you open it.</p>
        <p>3. Hit <b>Analyse</b> — Stockfish runs right in your browser and grades every move, computes your accuracy, and turns your mistakes into personal puzzles.</p>
      </div>
      <div id="imp-result" style="margin-top:16px"></div>
    </div>
  </div>`;

  const panels = {
    chesscom: `
      <h2>Chess.com</h2>
      <div class="stack">
        <label class="field">Username<input id="cc-user" value="${esc(s.chesscomUser)}" placeholder="e.g. hikaru" autocomplete="off"></label>
        <label class="field">Period<select id="cc-months"><option value="1">Last month</option><option value="3" selected>Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last year</option><option value="all">All time</option></select></label>
        <label class="check"><input type="checkbox" id="cc-remember" checked> Remember username &amp; auto-sync</label>
        <button class="btn primary lg" id="cc-go">Import from Chess.com</button>
        <div class="muted small" id="cc-status"></div>
      </div>`,
    lichess: `
      <h2>Lichess</h2>
      <div class="stack">
        <label class="field">Username<input id="li-user" value="${esc(s.lichessUser)}" placeholder="e.g. DrNykterstein" autocomplete="off"></label>
        <label class="field">Number of games<select id="li-max"><option>50</option><option selected>100</option><option>300</option><option>1000</option></select></label>
        <label class="field">Time control<select id="li-perf"><option value="">All</option><option value="bullet">Bullet</option><option value="blitz">Blitz</option><option value="rapid">Rapid</option><option value="classical">Classical</option><option value="correspondence">Correspondence</option></select></label>
        <label class="check"><input type="checkbox" id="li-remember" checked> Remember username &amp; auto-sync</label>
        <button class="btn primary lg" id="li-go">Import from Lichess</button>
        <div class="muted small" id="li-status"></div>
      </div>`,
    pgn: `
      <h2>Paste PGN</h2>
      <div class="stack">
        <textarea id="pgn-text" placeholder='[Event "Casual game"]\n[White "Me"]\n...\n\n1. e4 e5 2. Nf3 Nc6 ...'></textarea>
        <label class="field">I played as<select id="pgn-side"><option value="auto">Auto-detect from my usernames</option><option value="w">White</option><option value="b">Black</option><option value="none">Neither (just analyse)</option></select></label>
        <button class="btn primary lg" id="pgn-go">Add game(s)</button>
      </div>`,
  };

  const show = t => {
    $$('#imp-tabs button', root).forEach(b => b.classList.toggle('active', b.dataset.t === t));
    $('#imp-panel', root).innerHTML = panels[t];
    wire(t);
  };
  $('#imp-tabs', root).onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.t); };
  show(params.tab || 'chesscom');

  function done(list, added) {
    const mine = list.filter(g => g.userColor);
    const ids = mine.map(g => g.id).filter(id => !state.games[id].analysis);
    $('#imp-result', root).innerHTML = `
      <div class="card" style="background:var(--bg2)">
        <h3>✅ Imported ${added} new game${added === 1 ? '' : 's'}</h3>
        <p class="muted">${list.length} found, ${list.length - added} already in your library.</p>
        <div class="row">
          <a class="btn primary" href="#/games">View my games</a>
          ${ids.length ? `<button class="btn" id="imp-an">Analyse latest ${Math.min(10, ids.length)}</button>` : ''}
        </div>
      </div>`;
    const b = $('#imp-an', root);
    if (b) b.onclick = () => { analyzer.add(ids.slice(0, 10)); toast('Analysis started — you can keep browsing.', 'success'); b.disabled = true; };
  }

  function wire(t) {
    if (t === 'chesscom') {
      $('#cc-go', root).onclick = async () => {
        const btn = $('#cc-go', root), st = $('#cc-status', root);
        const u = $('#cc-user', root).value.trim();
        btn.disabled = true;
        try {
          const list = await importChessCom(u, { months: $('#cc-months', root).value === 'all' ? 'all' : +$('#cc-months', root).value, onProgress: m => st.textContent = m });
          if ($('#cc-remember', root).checked) { state.settings.chesscomUser = u; state.settings.lastSync.chesscom = Date.now(); save('settings'); }
          const added = addGames(list);
          st.textContent = '';
          done(list, added);
        } catch (e) { st.textContent = ''; toast(e.message, 'error'); }
        btn.disabled = false;
      };
    } else if (t === 'lichess') {
      $('#li-go', root).onclick = async () => {
        const btn = $('#li-go', root), st = $('#li-status', root);
        const u = $('#li-user', root).value.trim();
        btn.disabled = true;
        try {
          const list = await importLichess(u, { max: +$('#li-max', root).value, perfType: $('#li-perf', root).value, onProgress: m => st.textContent = m });
          if ($('#li-remember', root).checked) { state.settings.lichessUser = u; state.settings.lastSync.lichess = Date.now(); save('settings'); }
          const added = addGames(list);
          st.textContent = '';
          done(list, added);
        } catch (e) { st.textContent = ''; toast(e.message, 'error'); }
        btn.disabled = false;
      };
    } else {
      $('#pgn-go', root).onclick = () => {
        const txt = $('#pgn-text', root).value.trim();
        if (!txt) return toast('Paste a PGN first', 'error');
        const list = importPgnText(txt, $('#pgn-side', root).value);
        const ok = list.filter(g => { try { return parseGame(g.pgn).moves.length > 0; } catch { return false; } });
        if (!ok.length) return toast('That PGN could not be read', 'error');
        const added = addGames(ok);
        if (list.length === 1 && !list[0].userColor && $('#pgn-side', root).value === 'auto') toast('Couldn’t tell which side you played — set your usernames in Settings or pick a side.', 'info', 5000);
        done(ok, added);
      };
    }
  }
}
