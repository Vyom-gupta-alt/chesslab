import { state, save, saveNow, DEFAULT_SETTINGS, KEYS } from '../store.js';
import { $, esc, toast, confirmBox } from '../ui.js';
import { applyBoardTheme } from '../app.js';

export function render(root) {
  const s = state.settings;
  root.innerHTML = `
  <div class="page-head"><div><h1>Settings</h1></div></div>
  <div class="grid g2">
    <div class="card stack">
      <h2>Accounts</h2>
      <label class="field">Chess.com username<input id="s-cc" value="${esc(s.chesscomUser)}"></label>
      <label class="field">Lichess username<input id="s-li" value="${esc(s.lichessUser)}"></label>
      <label class="check"><input type="checkbox" id="s-auto" ${s.autoSync ? 'checked' : ''}> Auto-sync new games when I open ChessLab</label>
    </div>
    <div class="card stack">
      <h2>Analysis</h2>
      <label class="field">Engine depth <span class="hint">Higher = stronger but slower. 14 is a good balance (~1 min per game); 16+ for deep reviews.</span>
        <select id="s-depth">${[8, 10, 12, 14, 16, 18].map(d => `<option ${d === s.depth ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="s-cloud" ${s.useCloud ? 'checked' : ''}> Use Lichess cloud evaluations for opening positions (faster, enables “Book” moves)</label>
      <label class="field">Puzzle difficulty<select id="s-diff">${['easiest', 'easier', 'normal', 'harder', 'hardest'].map(d => `<option ${d === s.puzzleDifficulty ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="field">Board colours<select id="s-board">${['green', 'brown', 'blue', 'purple'].map(d => `<option ${d === s.boardTheme ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    </div>
  </div>
  <div class="row" style="margin-top:16px"><button class="btn primary lg" id="s-save">Save settings</button></div>
  <div class="card" style="margin-top:24px">
    <h2>Your data</h2>
    <p class="muted">Everything is stored privately in this browser. Back it up or move it to another computer with export/import.</p>
    <div class="row">
      <button class="btn" id="s-export">⬇ Export backup</button>
      <label class="btn">⬆ Import backup<input type="file" id="s-import" accept=".json" hidden></label>
      <button class="btn danger" id="s-clear">Delete all data</button>
    </div>
  </div>`;

  $('#s-save', root).onclick = () => {
    Object.assign(s, {
      chesscomUser: $('#s-cc', root).value.trim(), lichessUser: $('#s-li', root).value.trim(),
      autoSync: $('#s-auto', root).checked, depth: +$('#s-depth', root).value, depthChosen: true, useCloud: $('#s-cloud', root).checked,
      puzzleDifficulty: $('#s-diff', root).value, boardTheme: $('#s-board', root).value,
    });
    save('settings');
    applyBoardTheme();
    toast('Settings saved', 'success');
  };
  $('#s-export', root).onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'chesslab', v: 1, ...state })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chesslab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#s-import', root).onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'chesslab') throw new Error('Not a ChessLab backup');
      for (const k of KEYS) if (d[k]) { state[k] = d[k]; await saveNow(k); }
      toast('Backup restored', 'success');
      location.reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#s-clear', root).onclick = async () => {
    if (!await confirmBox('Delete all games, analysis, puzzles and goals from this browser? This cannot be undone.', 'Delete everything')) return;
    Object.assign(state, { games: {}, puzzles: {}, goals: [], pstats: { rating: 1500, themes: {}, history: [] }, activity: {}, repertoire: {}, settings: { ...DEFAULT_SETTINGS } });
    for (const k of KEYS) await saveNow(k);
    location.hash = '#/dashboard';
    location.reload();
  };
}
