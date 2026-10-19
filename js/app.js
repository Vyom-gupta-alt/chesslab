import { loadAll, state, save } from './store.js';
import { tagOpenings } from './openings.js';
import { analyzer } from './analyzer.js';
import { duePuzzles } from './training.js';
import { syncAccounts } from './importers.js';
import { $, $$, esc, toast } from './ui.js';

const routes = {
  dashboard: () => import('./views/dashboard.js'),
  import: () => import('./views/import.js'),
  games: () => import('./views/games.js'),
  review: () => import('./views/review.js'),
  puzzles: () => import('./views/puzzles.js'),
  analysis: () => import('./views/board.js'),
  coach: () => import('./views/coach.js'),
  rating: () => import('./views/rating.js'),
  openings: () => import('./views/openings.js'),
  goals: () => import('./views/goals.js'),
  settings: () => import('./views/settings.js'),
};

let current = null;
let routeSeq = 0;

async function route() {
  const seq = ++routeSeq;
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, query] = hash.split('?');
  const [name, ...rest] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (rest.length) params.id = decodeURIComponent(rest.join('/'));
  const key = routes[name] ? name : 'dashboard';
  try { current?.destroy?.(); } catch (e) { console.error(e); }
  current = null;
  const mod = await routes[key]();
  if (seq !== routeSeq) return;
  const view = $('#view');
  view.innerHTML = '';
  window.scrollTo(0, 0);
  current = mod;
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (key === 'review' ? 'games' : key)));
  try { await mod.render(view, params); }
  catch (e) { console.error(e); view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p></div>`; }
}

export function refreshBadges() {
  const n = duePuzzles().length;
  const b = $('#due-badge');
  b.hidden = !n;
  b.textContent = n;
}

function renderAnalyzerStatus() {
  const el = $('#analyzer-status');
  if (!analyzer.running) { el.hidden = true; return; }
  const g = state.games[analyzer.running];
  el.hidden = false;
  el.innerHTML = `<div class="spread"><b>Analysing…</b><a href="#" id="an-cancel" class="small">Stop</a></div>
    <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g ? `${g.white} vs ${g.black}` : '')}</div>
    <div class="bar"><i style="width:${Math.round(analyzer.progress * 100)}%"></i></div>
    <div class="muted small">${analyzer.queue.length ? `${analyzer.queue.length} more queued` : 'Last one'}</div>`;
  $('#an-cancel').onclick = e => { e.preventDefault(); analyzer.cancelAll(); };
}

export function applyBoardTheme() { document.body.dataset.board = state.settings.boardTheme || 'green'; }

async function init() {
  await loadAll();
  applyBoardTheme();
  tagOpenings(Object.values(state.games)).then(n => { if (n) save('games'); });
  if (window.Chart) {
    Chart.defaults.color = '#9b9790';
    Chart.defaults.borderColor = '#3a3733';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  }
  analyzer.events.addEventListener('update', renderAnalyzerStatus);
  analyzer.events.addEventListener('gameDone', refreshBadges);
  analyzer.events.addEventListener('gameError', e => toast('Analysis failed: ' + e.detail.error, 'error'));
  window.addEventListener('hashchange', route);
  refreshBadges();
  setInterval(refreshBadges, 60000);
  await route();

  const s = state.settings;
  if (s.autoSync && (s.chesscomUser || s.lichessUser)) {
    const { added, errors } = await syncAccounts();
    if (added) {
      toast(`Synced ${added} new game${added > 1 ? 's' : ''}`, 'success');
      if (/^#\/(dashboard|games)?$/.test(location.hash) || !location.hash) route();
    }
    errors.forEach(e => toast(e, 'error'));
  }
}

init();
