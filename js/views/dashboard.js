import { state, save, myGames, allGames, userResult } from '../store.js';
import { syncAccounts } from '../importers.js';
import { analyzer } from '../analyzer.js';
import { record, latestRatings, ratingSeries, analyzedMine, userAcc, avg, mistakeStats, openingStats, insights, evaluateGoal, userCounts } from '../stats.js';
import { duePuzzles, weaknesses, puzzleStreak } from '../training.js';
import { $, esc, toast, fmtDate, cap, pct, themeName, todayKey } from '../ui.js';

let charts = [];
export function destroy() { charts.forEach(c => c.destroy()); charts = []; }

const PALETTE = ['#81b64c', '#5c8bb0', '#e6912c', '#1baca6', '#c86bd8', '#f7c045', '#ee6b55', '#9b9790'];

export function render(root) {
  destroy();
  if (!allGames().length) return renderWelcome(root);
  const s = state.settings;
  const games = myGames();
  const rec = record(games);
  const an = analyzedMine();
  const last20 = an.slice(0, 20);
  const accNow = avg(last20.map(userAcc).filter(x => x != null));
  const accPrev = avg(an.slice(20, 40).map(userAcc).filter(x => x != null));
  const ms = mistakeStats(last20);
  const ratings = latestRatings().sort((a, b) => b.date - a.date);
  const due = duePuzzles().length;
  const wk = weaknesses()[0];
  const today = state.activity[todayKey()] || {};
  const unanalysed = games.filter(g => !g.analysis);
  const latest = games[0];
  const goals = state.goals.slice(0, 4).map(g => ({ g, e: evaluateGoal(g) }));
  const ins = insights();
  const who = s.chesscomUser || s.lichessUser || 'player';

  root.innerHTML = `
  <div class="card hero" style="margin-bottom:16px">
    <div class="spread">
      <div><h1 style="margin-bottom:4px">Welcome back, ${esc(who)} 👋</h1>
        <p class="muted" style="margin:0">${games.length} games · ${an.length} analysed · ${Object.keys(state.puzzles).length} personal puzzles</p></div>
      <div class="row">
        ${s.chesscomUser || s.lichessUser ? `<button class="btn" id="d-sync">↻ Sync games</button>` : `<a class="btn" href="#/import">Import games</a>`}
        ${unanalysed.length ? `<button class="btn primary" id="d-an">⚡ Analyse ${Math.min(10, unanalysed.length)} recent</button>` : ''}
      </div>
    </div>
    ${ratings.length ? `<div class="row" style="margin-top:14px;gap:18px">${ratings.slice(0, 6).map(r => `<div><div class="muted small">${r.source === 'chesscom' ? 'Chess.com' : 'Lichess'} ${cap(r.timeClass)}</div><div style="font-size:20px;font-weight:800">${r.rating}</div></div>`).join('')}</div>` : ''}
  </div>

  <div class="grid g4">
    <div class="card kpi"><span class="l">Record</span><span class="v">${pct(rec.win, rec.total)}%</span><span class="d"><span style="color:#a7dc75">${rec.win}W</span> · ${rec.draw}D · <span style="color:#f08a7c">${rec.loss}L</span></span></div>
    <div class="card kpi"><span class="l">Avg accuracy</span><span class="v">${accNow != null ? accNow.toFixed(1) + '%' : '—'}</span><span class="d">${accNow != null && accPrev != null ? `${accNow >= accPrev ? '▲' : '▼'} ${Math.abs(accNow - accPrev).toFixed(1)} vs previous 20` : `last ${last20.length} analysed games`}</span></div>
    <div class="card kpi"><span class="l">Blunders / game</span><span class="v">${last20.length ? ms.perGame.blunders.toFixed(2) : '—'}</span><span class="d">${last20.length ? `${ms.perGame.mistakes.toFixed(2)} mistakes · ${ms.perGame.inaccuracies.toFixed(1)} inaccuracies` : 'analyse games to see'}</span></div>
    <div class="card kpi"><span class="l">Puzzles</span><span class="v">${state.pstats.rating}</span><span class="d">🔥 ${puzzleStreak()} day streak · ${due} due</span></div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <div class="spread"><h2>Today's training plan</h2><span class="muted small">${today.solved || 0} puzzles solved today</span></div>
      ${latest ? `<div class="plan-item"><span class="pi">🔍</span><div class="grow"><b>Review your latest game</b><div class="muted small">vs ${esc(latest.userColor === 'w' ? latest.black : latest.white)} · ${userResult(latest) || ''} · ${fmtDate(latest.date)}</div></div><a class="btn sm ${latest.analysis ? '' : 'primary'}" href="#/review/${encodeURIComponent(latest.id)}">${latest.analysis ? 'Open' : 'Analyse'}</a></div>` : ''}
      <div class="plan-item"><span class="pi">🎯</span><div class="grow"><b>Drill your mistakes</b><div class="muted small">${due ? `${due} puzzle${due > 1 ? 's' : ''} due from your own games` : Object.keys(state.puzzles).length ? 'Nothing due — nice! Practise anyway?' : 'Analyse games to create these'}</div></div><a class="btn sm ${due ? 'primary' : ''}" href="#/puzzles?mode=drill">Start</a></div>
      <div class="plan-item"><span class="pi">🧠</span><div class="grow"><b>Train ${wk ? themeName(wk.theme) : 'tactics'}</b><div class="muted small">${wk ? 'Your most-missed pattern — 10 similar puzzles' : 'Mixed tactics to warm up'}</div></div><a class="btn sm" href="#/puzzles?mode=${wk ? 'theme&theme=' + wk.theme : 'weak'}">Train</a></div>
      <div class="plan-item"><span class="pi">☀️</span><div class="grow"><b>Daily puzzle</b><div class="muted small">Lichess puzzle of the day</div></div><a class="btn sm" href="#/puzzles?mode=daily">Solve</a></div>
    </div>
    <div class="card">
      <div class="spread"><h2>Goals</h2><a class="btn sm" href="#/goals">${goals.length ? 'Manage' : '+ Set goals'}</a></div>
      ${goals.length ? goals.map(({ e }) => `<div class="goal ${e.done ? 'done' : ''}"><span class="gt">${esc(e.label)}</span><span class="muted">${e.cur} / ${e.target}</span><div class="bar"><i style="width:${e.pct}%"></i></div></div>`).join('')
        : '<p class="muted">Set goals like a rating target, accuracy target or daily puzzle count, and track them automatically.</p>'}
    </div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="spread"><h2>Rating history</h2></div><div class="chart-box"><canvas id="c-rating"></canvas></div></div>
    <div class="card"><h2>Accuracy trend</h2><div class="chart-box">${an.length ? '<canvas id="c-acc"></canvas>' : '<div class="empty">Analyse games to see your accuracy trend.</div>'}</div></div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Insights</h2>${ins.length ? ins.map(i => `<div class="insight"><span class="ic">${i.ic}</span><span>${i.text}</span></div>`).join('') : '<p class="muted">Play and analyse a few more games to unlock personal insights.</p>'}</div>
    <div class="card"><h2>Where you lose points</h2><div class="chart-box">${an.length ? '<canvas id="c-phase"></canvas>' : '<div class="empty">Analyse games to see mistakes by game phase.</div>'}</div></div>
  </div>

  <div class="card" style="margin-top:16px">
    <h2>Openings</h2>
    <div class="grid g2">${['w', 'b'].map(c => {
      const ops = openingStats().filter(o => o.color === c).slice(0, 7);
      return `<div><h3>As ${c === 'w' ? 'White' : 'Black'}</h3>${ops.length ? `<table class="tbl"><thead><tr><th>Opening</th><th>Games</th><th>Score</th><th>Acc.</th></tr></thead><tbody>${ops.map(o => `<tr><td>${esc(o.name)}</td><td>${o.games}</td><td><span style="color:${o.score >= 55 ? '#a7dc75' : o.score < 45 ? '#f08a7c' : 'inherit'}">${o.score}%</span> <span class="muted small">${o.win}/${o.draw}/${o.loss}</span></td><td class="muted">${o.acc != null ? o.acc.toFixed(0) + '%' : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No games.</p>'}</div>`;
    }).join('')}</div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="spread"><h2>Recent games</h2><a href="#/games">All games →</a></div>
    <table class="tbl"><tbody>${games.slice(0, 8).map(g => {
      const r = userResult(g), a = userAcc(g), c = userCounts(g);
      return `<tr class="click" onclick="location.hash='#/review/${encodeURIComponent(g.id)}'">
        <td>${g.userColor === 'w' ? '⚪' : '⚫'} ${esc(g.userColor === 'w' ? g.black : g.white)} <span class="muted">(${(g.userColor === 'w' ? g.blackElo : g.whiteElo) ?? '?'})</span></td>
        <td>${r ? `<span class="pill ${r}">${cap(r)}</span>` : ''}</td>
        <td class="muted">${cap(g.timeClass || '')}</td>
        <td>${a != null ? `<b>${a.toFixed(1)}%</b>` : '<span class="muted">—</span>'}</td>
        <td class="muted small">${g.analysis ? `${c.blunder || 0} blunders · ${c.mistake || 0} mistakes` : 'not analysed'}</td>
        <td class="muted small">${fmtDate(g.date)}</td></tr>`;
    }).join('')}</tbody></table>
  </div>`;

  $('#d-sync', root)?.addEventListener('click', async e => {
    e.target.disabled = true; e.target.textContent = 'Syncing…';
    const { added, errors } = await syncAccounts();
    errors.forEach(x => toast(x, 'error'));
    toast(added ? `Added ${added} new games` : 'Already up to date', 'success');
    render(root);
  });
  $('#d-an', root)?.addEventListener('click', e => {
    analyzer.add(unanalysed.slice(0, 10).map(g => g.id));
    toast('Analysing in the background — progress is in the sidebar.', 'success');
    e.target.disabled = true;
  });

  drawCharts(root, an, ms);
}

function drawCharts(root, an, ms) {
  if (!window.Chart) return;
  const series = ratingSeries();
  const ds = Object.entries(series).filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 5)
    .map(([k, v], i) => ({ label: k, data: v, borderColor: PALETTE[i], backgroundColor: PALETTE[i], pointRadius: 0, tension: .2, borderWidth: 2 }));
  charts.push(new Chart($('#c-rating', root), {
    type: 'line', data: { datasets: ds },
    options: {
      maintainAspectRatio: false, parsing: false, interaction: { mode: 'nearest', intersect: false },
      scales: { x: { type: 'linear', ticks: { callback: v => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), maxTicksLimit: 6 } } },
      plugins: { tooltip: { callbacks: { title: it => fmtDate(it[0].parsed.x) } } },
    },
  }));
  const accEl = $('#c-acc', root);
  if (accEl) {
    const pts = an.slice(0, 40).reverse().map(g => ({ g, a: userAcc(g) })).filter(x => x.a != null);
    const rolling = pts.map((_, i) => avg(pts.slice(Math.max(0, i - 4), i + 1).map(x => x.a)));
    charts.push(new Chart(accEl, {
      type: 'line',
      data: {
        labels: pts.map(x => fmtDate(x.g.date)),
        datasets: [
          { label: 'Game accuracy', data: pts.map(x => x.a), borderColor: 'transparent', backgroundColor: pts.map(x => userResult(x.g) === 'win' ? '#81b64c' : userResult(x.g) === 'loss' ? '#e2503f' : '#9b9790'), pointRadius: 4, showLine: false },
          { label: '5-game average', data: rolling, borderColor: '#5c8bb0', pointRadius: 0, tension: .3, borderWidth: 2 },
        ],
      },
      options: { maintainAspectRatio: false, scales: { y: { suggestedMin: 50, max: 100 }, x: { ticks: { maxTicksLimit: 6 } } } },
    }));
  }
  const phEl = $('#c-phase', root);
  if (phEl) {
    const labels = ['opening', 'middlegame', 'endgame'];
    charts.push(new Chart(phEl, {
      type: 'bar',
      data: {
        labels: labels.map(cap),
        datasets: [
          { label: 'Blunders', data: labels.map(k => ms.phase[k].b), backgroundColor: '#ca3431' },
          { label: 'Mistakes', data: labels.map(k => ms.phase[k].m), backgroundColor: '#e6912c' },
          { label: 'Inaccuracies', data: labels.map(k => ms.phase[k].i), backgroundColor: '#f7c045' },
        ],
      },
      options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } },
    }));
  }
}

function renderWelcome(root) {
  const s = state.settings;
  root.innerHTML = `
  <div class="card hero" style="max-width:760px;margin:30px auto">
    <div style="font-size:46px">♞</div>
    <h1 style="font-size:30px">Your all-in-one chess improvement hub</h1>
    <p class="muted" style="line-height:1.6;font-size:15px">Connect your Chess.com and/or Lichess account. ChessLab pulls in your games automatically, reviews every move with Stockfish (accuracy, brilliants, blunders, missed wins), turns your mistakes into puzzles, finds your weak tactical patterns and tracks your goals.</p>
    <div class="grid g2" style="margin-top:18px">
      <label class="field">Chess.com username<input id="w-cc" value="${esc(s.chesscomUser)}" placeholder="optional"></label>
      <label class="field">Lichess username<input id="w-li" value="${esc(s.lichessUser)}" placeholder="optional"></label>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn primary lg" id="w-go">Import my games</button>
      <a class="btn lg ghost" href="#/import?tab=pgn">or paste a PGN</a>
    </div>
    <p class="muted small" id="w-st" style="margin-top:10px"></p>
  </div>`;
  $('#w-go', root).onclick = async () => {
    const cc = $('#w-cc', root).value.trim(), li = $('#w-li', root).value.trim();
    if (!cc && !li) return toast('Enter at least one username', 'error');
    state.settings.chesscomUser = cc;
    state.settings.lichessUser = li;
    state.settings.lastSync = {};
    save('settings');
    $('#w-go', root).disabled = true;
    const { added, errors } = await syncAccounts({ onProgress: m => $('#w-st', root).textContent = m });
    errors.forEach(e => toast(e, 'error'));
    if (added) {
      toast(`Imported ${added} games!`, 'success');
      const ids = myGames().slice(0, 5).map(g => g.id);
      analyzer.add(ids);
      toast('Analysing your 5 most recent games in the background…', 'info', 5000);
      render(root);
    } else {
      $('#w-go', root).disabled = false;
      $('#w-st', root).textContent = errors.length ? '' : 'No games found for those usernames.';
    }
  };
}
