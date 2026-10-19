// Coach: scores five areas of your chess, shows why you lose, and builds drills from your mistakes.
import { myGames } from '../store.js';
import { coachReport, lossCauses, analyzedMine } from '../stats.js';
import { minePuzzles, DRILLS, puzzleCats, weaknesses } from '../training.js';
import { analyzer } from '../analyzer.js';
import { $, esc, fmtDate, themeName, toast } from '../ui.js';

let charts = [];
export function destroy() { charts.forEach(c => c.destroy()); charts = []; }

const AREAS = {
  tactics: { name: 'Tactics', tip: w => `Spot more forks, pins and mates. Your top blind spot: <b>${w ? themeName(w.theme) : 'mixed tactics'}</b>.`, link: w => w ? `#/puzzles?mode=theme&theme=${w.theme}` : '#/puzzles?mode=weak', cta: 'Train tactics' },
  blunders: { name: 'Blunders', tip: () => 'Before every move ask: what does their last move attack, and what does my move leave hanging?', link: () => '#/puzzles?mode=cat&cat=trap', cta: 'Drill “Spot the trap”' },
  conversion: { name: 'Conversion', tip: () => 'When winning: trade pieces, stop counterplay, and look for checks/captures for both sides.', link: () => '#/puzzles?mode=cat&cat=finish', cta: 'Drill “Finish the win”' },
  clock: { name: 'Clock', tip: () => 'Spend time on critical moments (captures, checks, plans) and play quickly in simple positions.', link: () => '#/puzzles?mode=cat&cat=rushed', cta: 'Drill “Rushed moves”' },
  openings: { name: 'Openings', tip: () => 'Get playable positions out of the opening — learn the main lines of what you actually play.', link: () => '#/openings', cta: 'Study my openings' },
};
const scoreColor = s => s == null ? 'var(--muted)' : s >= 70 ? 'var(--accent)' : s >= 45 ? 'var(--yellow)' : 'var(--red)';

export function render(root) {
  destroy();
  const rep = coachReport();
  const unanalysed = myGames().filter(g => !g.analysis);
  if (!rep) {
    root.innerHTML = `<div class="page-head"><div><h1>Coach</h1><p>Your personal coach needs analysed games to work with.</p></div></div>
      <div class="card empty"><div class="big">🧑‍🏫</div><p>Analyse some of your games and the coach will score your tactics, blunders, conversion, clock and openings.</p>
      ${unanalysed.length ? `<button class="btn primary lg" id="c-an">⚡ Analyse my ${Math.min(20, unanalysed.length)} latest games</button>` : '<a class="btn primary" href="#/import">Import games</a>'}</div>`;
    $('#c-an', root)?.addEventListener('click', e => { analyzer.add(unanalysed.slice(0, 20).map(g => g.id)); toast('Analysing in the background…', 'success'); e.target.disabled = true; });
    return;
  }
  const wk = weaknesses()[0];
  const S = rep.scores;
  const keys = Object.keys(AREAS);
  const ranked = keys.filter(k => S[k] != null).sort((a, b) => S[a] - S[b]);
  const weakest = ranked[0];
  const losses = lossCauses();
  const causeCount = {};
  losses.forEach(l => { if (l.key !== 'none') causeCount[l.cause.replace(/ \(.*\)/, '')] = (causeCount[l.cause.replace(/ \(.*\)/, '')] || 0) + 1; });
  const causeList = Object.entries(causeCount).sort((a, b) => b[1] - a[1]);
  const puz = minePuzzles();
  const drillCounts = Object.fromEntries(Object.keys(DRILLS).map(k => [k, puz.filter(p => puzzleCats(p).includes(k)).length]));

  root.innerHTML = `
  <div class="page-head"><div><h1>Coach</h1><p>Based on your last ${rep.n} analysed games${analyzedMine().length < 10 ? ' — analyse more games for a more reliable picture' : ''}.</p></div>
    ${unanalysed.length ? `<button class="btn" id="c-an">⚡ Analyse ${Math.min(20, unanalysed.length)} more games</button>` : ''}</div>

  <div class="grid g2">
    <div class="card">
      <h2>Five areas of your chess</h2>
      <div class="chart-box" style="height:300px"><canvas id="c-radar"></canvas></div>
      <p class="muted small" style="text-align:center;margin:6px 0 0">0–100 · scored from your own games and puzzles</p>
    </div>
    <div class="card">
      <h2>🧑‍🏫 Coach's verdict</h2>
      <div class="insight"><span class="ic">🎯</span><span>Your biggest weakness right now is <b>${AREAS[weakest].name}</b> (${S[weakest]}/100). ${rep.details[weakest]}<br><span class="muted">${AREAS[weakest].tip(wk)}</span><br><a class="btn sm primary" style="margin-top:8px" href="${AREAS[weakest].link(wk)}">${AREAS[weakest].cta} →</a></span></div>
      ${ranked.length > 1 ? `<div class="insight"><span class="ic">💪</span><span>Your strongest area is <b>${AREAS[ranked.at(-1)].name}</b> (${S[ranked.at(-1)]}/100). ${rep.details[ranked.at(-1)]}</span></div>` : ''}
      ${causeList.length ? `<div class="insight"><span class="ic">📉</span><span>Most common way you lose: <b>${esc(causeList[0][0].toLowerCase())}</b> (${causeList[0][1]} of ${losses.filter(l => l.key !== 'none').length} recent losses we could classify).</span></div>` : ''}
    </div>
  </div>

  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));margin-top:16px">
    ${keys.map(k => `<div class="card">
      <div class="spread"><b>${AREAS[k].name}</b><span style="font-size:24px;font-weight:800;color:${scoreColor(S[k])}">${S[k] ?? '—'}</span></div>
      <div class="bar" style="margin:8px 0"><i style="width:${S[k] ?? 0}%;background:${scoreColor(S[k])}"></i></div>
      <p class="muted small" style="line-height:1.5;min-height:54px">${rep.details[k]}</p>
      <a class="btn sm" href="${AREAS[k].link(wk)}">${AREAS[k].cta}</a></div>`).join('')}
  </div>

  <div class="card" style="margin-top:16px">
    <h2>Drills built from your mistakes</h2>
    <div class="grid g4">${Object.entries(DRILLS).map(([k, d]) => `
      <a class="theme-btn" href="${drillCounts[k] ? `#/puzzles?mode=cat&cat=${k}` : '#/coach'}" style="display:block;${drillCounts[k] ? '' : 'opacity:.55'}">
        <div style="font-size:26px">${d.icon}</div><div class="tn">${d.name}</div><div class="ts">${d.desc}</div>
        <div style="margin-top:8px;font-weight:700;color:var(--accent)">${drillCounts[k]} position${drillCounts[k] === 1 ? '' : 's'}</div></a>`).join('')}</div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Where you lose</h2><div class="chart-box">${causeList.length ? '<canvas id="c-causes"></canvas>' : '<div class="empty">No analysed losses yet.</div>'}</div></div>
    <div class="card"><h2>Your recent losses</h2>
      <div style="max-height:300px;overflow:auto">${losses.slice(0, 25).map(l => `<div class="insight" style="cursor:pointer" onclick="location.hash='#/review/${encodeURIComponent(l.g.id)}${l.ply != null ? `?ply=${l.ply + 1}` : ''}'">
        <span class="ic">${{ time: '⏱', conversion: '🏁', opening: '📖', middlegame: '⚔', endgame: '♔', outplayed: '🐢', none: '·' }[l.key] || '•'}</span>
        <span><b>${esc(l.cause)}</b> <span class="muted">vs ${esc(l.g.userColor === 'w' ? l.g.black : l.g.white)} · ${fmtDate(l.g.date)}</span>${l.ply != null ? ' <span class="muted small">— see the moment →</span>' : ''}</span></div>`).join('') || '<p class="muted">No losses — nice!</p>'}</div>
    </div>
  </div>`;

  $('#c-an', root)?.addEventListener('click', e => { analyzer.add(unanalysed.slice(0, 20).map(g => g.id)); toast('Analysing in the background — refresh the coach when done.', 'success'); e.target.disabled = true; });

  if (!window.Chart) return;
  charts.push(new Chart($('#c-radar', root), {
    type: 'radar',
    data: {
      labels: keys.map(k => `${AREAS[k].name} ${S[k] ?? '–'}`),
      datasets: [{ data: keys.map(k => S[k] ?? 0), backgroundColor: 'rgba(27,172,166,.18)', borderColor: '#1baca6', pointBackgroundColor: keys.map(k => k === weakest ? '#e2503f' : '#1baca6'), pointRadius: keys.map(k => k === weakest ? 6 : 4) }],
    },
    options: {
      maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: '#3a3733' }, angleLines: { color: '#3a3733' }, pointLabels: { color: '#e8e6e3', font: { size: 13, weight: '600' } } } },
    },
  }));
  if (causeList.length) {
    charts.push(new Chart($('#c-causes', root), {
      type: 'doughnut',
      data: { labels: causeList.map(c => c[0]), datasets: [{ data: causeList.map(c => c[1]), backgroundColor: ['#ca3431', '#e6912c', '#f7c045', '#5c8bb0', '#1baca6', '#c86bd8', '#9b9790'], borderColor: '#262421' }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
    }));
  }
}
