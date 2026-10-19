import { state, save } from '../store.js';
import { GOAL_TYPES, evaluateGoal, suggestedGoals, latestRatings } from '../stats.js';
import { $, esc, toast, modal, cap } from '../ui.js';

export function render(root) {
  const draw = () => {
    const goals = state.goals.map((g, i) => ({ g, i, e: evaluateGoal(g) }));
    const done = goals.filter(x => x.e.done).length;
    root.innerHTML = `
    <div class="page-head">
      <div><h1>Goals</h1><p>${goals.length ? `${done} of ${goals.length} goals reached` : 'Set targets and ChessLab tracks them automatically from your games and puzzles.'}</p></div>
      <div class="row"><button class="btn" id="gl-suggest">✨ Suggest goals for me</button><button class="btn primary" id="gl-add">+ New goal</button></div>
    </div>
    <div class="card">${goals.length ? goals.map(({ g, i, e }) => `
      <div class="goal ${e.done ? 'done' : ''}">
        <div><div class="gt">${esc(e.label)}</div><div class="muted small">${GOAL_TYPES[g.type]}${g.deadline ? ` · by ${esc(g.deadline)}` : ''}</div></div>
        <div class="row">
          <span><b>${e.cur}</b> <span class="muted">/ ${e.target}</span></span>
          ${g.type === 'custom' ? `<button class="btn sm" data-toggle="${i}">${g.done ? 'Undo' : 'Mark done'}</button>` : ''}
          <button class="btn sm ghost" data-del="${i}" title="Delete">✕</button>
        </div>
        <div class="bar"><i style="width:${e.pct}%;${e.done ? '' : e.pct < 40 ? 'background:var(--orange)' : ''}"></i></div>
      </div>`).join('') : '<div class="empty"><div class="big">◎</div><p>No goals yet.</p></div>'}</div>`;

    $('#gl-add', root).onclick = () => openEditor();
    $('#gl-suggest', root).onclick = () => {
      const have = new Set(state.goals.map(g => g.type));
      const add = suggestedGoals().filter(g => !have.has(g.type));
      if (!add.length) return toast('You already have all the suggested goals', 'info');
      state.goals.push(...add);
      save('goals');
      toast(`Added ${add.length} goals`, 'success');
      draw();
    };
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { state.goals.splice(+b.dataset.del, 1); save('goals'); draw(); });
    root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { const g = state.goals[+b.dataset.toggle]; g.done = !g.done; save('goals'); draw(); });
  };

  function openEditor() {
    const ratings = latestRatings();
    const m = modal(`
      <h2>New goal</h2>
      <div class="stack">
        <label class="field">Type<select id="ge-type">${Object.entries(GOAL_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <div id="ge-fields"></div>
        <label class="field">Deadline <span class="hint">optional</span><input type="date" id="ge-deadline"></label>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="ge-cancel">Cancel</button><button class="btn primary" id="ge-save">Save goal</button></div>`);
    const f = $('#ge-fields', m.el);
    const fields = t => {
      if (t === 'rating') {
        const opts = ratings.length ? ratings : [{ source: 'chesscom', timeClass: 'blitz', rating: 1200 }, { source: 'chesscom', timeClass: 'rapid', rating: 1200 }, { source: 'lichess', timeClass: 'blitz', rating: 1500 }, { source: 'lichess', timeClass: 'rapid', rating: 1500 }];
        f.innerHTML = `<label class="field">Rating pool<select id="ge-pool">${opts.map((r, i) => `<option value="${i}">${r.source === 'chesscom' ? 'Chess.com' : 'Lichess'} ${cap(r.timeClass)}${ratings.length ? ` (now ${r.rating})` : ''}</option>`).join('')}</select></label>
          <label class="field">Target rating<input type="number" id="ge-target" value="${(opts[0].rating || 1200) + 100}"></label>`;
        f.dataset.opts = JSON.stringify(opts);
      } else if (t === 'custom') {
        f.innerHTML = `<label class="field">Goal<input id="ge-text" placeholder="e.g. Learn the Caro-Kann main lines"></label>`;
      } else {
        const def = { accuracy: 80, blunders: 0.5, puzzlesDaily: 10, streak: 7, analyzeWeekly: 5 }[t];
        f.innerHTML = `<label class="field">Target<input type="number" step="any" id="ge-target" value="${def}"></label>`;
      }
    };
    const typeSel = $('#ge-type', m.el);
    typeSel.onchange = () => fields(typeSel.value);
    fields(typeSel.value);
    $('#ge-cancel', m.el).onclick = m.close;
    $('#ge-save', m.el).onclick = () => {
      const t = typeSel.value;
      const g = { type: t, deadline: $('#ge-deadline', m.el).value || null, created: Date.now() };
      if (t === 'custom') {
        g.text = $('#ge-text', m.el).value.trim();
        if (!g.text) return toast('Describe your goal', 'error');
      } else {
        g.target = +$('#ge-target', m.el).value;
        if (!g.target && g.target !== 0) return toast('Enter a target', 'error');
      }
      if (t === 'rating') {
        const r = JSON.parse(f.dataset.opts)[+$('#ge-pool', m.el).value];
        Object.assign(g, { source: r.source, timeClass: r.timeClass, start: r.rating });
      }
      state.goals.push(g);
      save('goals');
      m.close();
      draw();
    };
  }
  draw();
}
