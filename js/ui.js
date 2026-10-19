export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, type = 'info', ms = 3500) {
  const t = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(inner) {
  const back = h(`<div class="modal-back"><div class="modal">${inner}</div></div>`);
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.body.appendChild(back);
  return { el: back.querySelector('.modal'), close };
}

export function confirmBox(text, okLabel = 'Confirm') {
  return new Promise(res => {
    const m = modal(`<p style="line-height:1.5">${esc(text)}</p><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`);
    m.el.querySelector('[data-x]').onclick = () => { m.close(); res(false); };
    m.el.querySelector('[data-ok]').onclick = () => { m.close(); res(true); };
  });
}

// Move classifications (chess.com style)
export const CLS = {
  brilliant: { label: 'Brilliant', sym: '!!', color: '#1baca6' },
  great: { label: 'Great', sym: '!', color: '#5c8bb0' },
  best: { label: 'Best', sym: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', sym: '✓', color: '#96bc4b' },
  good: { label: 'Good', sym: '✓', color: '#77915f' },
  book: { label: 'Book', sym: '📖', color: '#a88865' },
  forced: { label: 'Forced', sym: '→', color: '#7d7d7d' },
  inaccuracy: { label: 'Inaccuracy', sym: '?!', color: '#f7c045' },
  mistake: { label: 'Mistake', sym: '?', color: '#e6912c' },
  miss: { label: 'Miss', sym: '✗', color: '#ee6b55' },
  blunder: { label: 'Blunder', sym: '??', color: '#ca3431' },
};
export const CLS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

export function clsIcon(cls, extra = '') {
  const c = CLS[cls];
  if (!c) return '';
  return `<span class="ci ${extra}" style="background:${c.color}" title="${c.label}">${c.sym}</span>`;
}

export const THEMES = {
  mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', mateIn5: 'Mate in 5+', mate: 'Checkmate',
  backRankMate: 'Back-rank mate', fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack',
  hangingPiece: 'Hanging piece', sacrifice: 'Sacrifice', promotion: 'Promotion', advancedPawn: 'Advanced pawn',
  defensiveMove: 'Defensive move', quietMove: 'Quiet move', trappedPiece: 'Trapped piece', deflection: 'Deflection',
  attraction: 'Attraction', kingsideAttack: 'Kingside attack', capturingDefender: 'Capture the defender',
  doubleCheck: 'Double check', zugzwang: 'Zugzwang', intermezzo: 'Intermezzo',
  opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame', rookEndgame: 'Rook endgame', pawnEndgame: 'Pawn endgame',
  advantage: 'Gain advantage', crushing: 'Crushing', equality: 'Equalize', short: 'Short puzzle', long: 'Long puzzle', mix: 'Healthy mix',
};
export const themeName = t => THEMES[t] || t.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

export const fmtDate = ms => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
