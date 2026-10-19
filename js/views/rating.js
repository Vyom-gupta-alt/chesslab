// Rating Check: the rating you actually played at in each game vs your real rating — no sugar-coating.
import { myGames } from '../store.js';
import { playedRating, verdict, overallVerdict } from '../perf.js';
import { analyzer } from '../analyzer.js';
import { $, esc, fmtDate, cap, toast } from '../ui.js';

let charts = [];
export function destroy() { charts.forEach(c => c.destroy()); charts = []; }

const deltaColor = d => d == null ? 'var(--muted)' : d >= 100 ? '#a7dc75' : d > -100 ? 'var(--text)' : d > -300 ? 'var(--orange)' : 'var(--red)';
const sign = d => d == null ? '—' : (d > 0 ? '+' : '') + d;

export function render(root, params) {
  destroy();
  const tc = params.tc || '';
  const games = myGames();
  const all = games.filter(g => g.analysis).map(g => ({ g, p: playedRating(g) })).filter(x => x.p);
  const classes = [...new Set(all.map(x => x.g.timeClass))];
  const list = all.filter(x => !tc || x.g.timeClass === tc);
  const unanalysed = games.filter(g => !g.analysis);

  const head = `<div class="page-head"><div><h1>🔥 Rating check</h1><p>The rating you <i>actually</i> played at in each game, based on engine accuracy — no sugar-coating.</p></div>
    <div class="row">${classes.length > 1 ? `<select id="rc-tc"><option value="">All time controls</option>${classes.map(c => `<option value="${c}" ${c === tc ? 'selected' : ''}>${cap(c)}</option>`).join('')}</select>` : ''}
    ${unanalysed.length ? `<button class="btn" id="rc-an">⚡ Analyse ${Math.min(20, unanalysed.length)} more games</button>` : ''}</div></div>`;

  if (!list.length) {
    root.innerHTML = head + `<div class="card empty"><div class="big">🔥</div><p>Analyse some games first — then we'll tell you how strong you <b>really</b> played.</p></div>`;
    wire();
    return;
  }

  // Short games are shown in the table but don't count towards the averages.
  const solid = list.filter(x => !x.p.lowConfidence).length ? list.filter(x => !x.p.lowConfidence) : list;
  const withActual = solid.filter(x => x.p.actual);
  const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const avgPlayed = Math.round(avg(solid.map(x => x.p.rating)) / 25) * 25;
  const avgActual = Math.round(avg(withActual.map(x => x.p.actual)));
  const spread = Math.round(Math.sqrt(avg(solid.map(x => (x.p.rating - avgPlayed) ** 2))) / 25) * 25;
  const below = Math.round((withActual.filter(x => x.p.delta < -50).length / (withActual.length || 1)) * 100);
  const best = [...solid].sort((a, b) => b.p.rating - a.p.rating)[0];
  const worst = [...solid].sort((a, b) => a.p.rating - b.p.rating)[0];
  const d = avgPlayed - avgActual;

  root.innerHTML = head + `
  <div class="card hero" style="margin-bottom:16px">
    <div class="grid g3" style="align-items:center">
      <div class="kpi"><span class="l">Your rating</span><span class="v">${avgActual || '—'}</span><span class="d">average over these games</span></div>
      <div class="kpi"><span class="l">You actually play like</span><span class="v" style="font-size:40px;color:${deltaColor(d)}">${avgPlayed}</span><span class="d">${sign(Math.round(d))} vs your rating</span></div>
      <div class="kpi"><span class="l">Consistency</span><span class="v">±${spread}</span><span class="d">${below}% of games played below your rating</span></div>
    </div>
    <p style="margin:16px 0 0;font-size:15px;line-height:1.6"><b>Verdict:</b> ${esc(overallVerdict(avgPlayed, avgActual, spread, below))}</p>
    ${solid.length < 8 ? `<p class="muted small" style="margin:8px 0 0">Based on only ${solid.length} analysed game${solid.length > 1 ? 's' : ''}. Analyse more for an honest average.</p>` : ''}
  </div>

  <div class="grid g2">
    <div class="card"><h2>Rating vs how you actually played</h2><div class="chart-box"><canvas id="rc-chart"></canvas></div></div>
    <div class="card stack">
      <h2>Best & worst</h2>
      <div class="insight" style="cursor:pointer" onclick="location.hash='#/review/${encodeURIComponent(best.g.id)}'"><span class="ic">🏆</span><span>Best: played like a <b>${best.p.rating}</b> vs ${esc(best.g.userColor === 'w' ? best.g.black : best.g.white)} (${fmtDate(best.g.date)}).<br><span class="muted">${esc(verdict(best.p, 1))}</span></span></div>
      <div class="insight" style="cursor:pointer" onclick="location.hash='#/review/${encodeURIComponent(worst.g.id)}'"><span class="ic">💀</span><span>Worst: played like a <b>${worst.p.rating}</b> vs ${esc(worst.g.userColor === 'w' ? worst.g.black : worst.g.white)} (${fmtDate(worst.g.date)}).<br><span class="muted">${esc(verdict(worst.p, 2))}</span></span></div>
    </div>
  </div>

  <div class="card" style="margin-top:16px;padding:0"><div class="table-wrap"><table class="tbl">
    <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>Your rating</th><th>Played like</th><th>Diff</th><th>Verdict</th></tr></thead>
    <tbody>${list.map(({ g, p }, i) => `<tr class="click" onclick="location.hash='#/review/${encodeURIComponent(g.id)}'">
      <td class="muted">${fmtDate(g.date)}</td>
      <td>${esc(g.userColor === 'w' ? g.black : g.white)} <span class="muted">(${p.opp ?? '?'})</span></td>
      <td>${p.res ? `<span class="pill ${p.res}">${cap(p.res)}</span>` : ''}</td>
      <td>${p.actual ?? '—'}</td>
      <td><b style="font-size:16px">${p.rating}</b>${p.lowConfidence ? ' <span class="muted small" title="Short game">*</span>' : ''}</td>
      <td style="font-weight:700;color:${deltaColor(p.delta)}">${sign(p.delta)}</td>
      <td class="small" style="max-width:420px;line-height:1.45">${esc(verdict(p, i))}</td></tr>`).join('')}</tbody></table></div></div>
  <p class="muted small" style="margin-top:10px">Estimated from engine accuracy on your non-book moves, with penalties for every blunder, mistake and thrown win. * = short game, not counted in the averages. It's a rough guide, not an official rating.</p>`;

  wire();
  if (window.Chart) {
    const pts = [...list].reverse();
    charts.push(new Chart($('#rc-chart', root), {
      type: 'line',
      data: {
        labels: pts.map(x => fmtDate(x.g.date)),
        datasets: [
          { label: 'Your rating', data: pts.map(x => x.p.actual), borderColor: '#9b9790', pointRadius: 0, borderWidth: 2, tension: .2 },
          { label: 'Played like', data: pts.map(x => x.p.rating), borderColor: 'transparent', pointRadius: 5, showLine: false, backgroundColor: pts.map(x => x.p.delta == null ? '#5c8bb0' : x.p.delta >= 100 ? '#81b64c' : x.p.delta > -100 ? '#f1f1f1' : x.p.delta > -300 ? '#e6912c' : '#e2503f') },
        ],
      },
      options: { maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 6 } } } },
    }));
  }

  function wire() {
    $('#rc-tc', root)?.addEventListener('change', e => { location.hash = '#/rating' + (e.target.value ? `?tc=${e.target.value}` : ''); });
    $('#rc-an', root)?.addEventListener('click', e => { analyzer.add(unanalysed.slice(0, 20).map(g => g.id)); toast('Analysing in the background — come back when the sidebar says done.', 'success'); e.target.disabled = true; });
  }
}
