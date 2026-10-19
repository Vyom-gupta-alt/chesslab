// Interactive chessboard: click-to-move, drag-and-drop, arrows, highlights, move badges.
import { CLS } from './ui.js';

const FILES = 'abcdefgh';
const pieceUrl = (c, t) => `https://lichess1.org/assets/piece/cburnett/${c}${t.toUpperCase()}.svg`;
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

export function parseFenBoard(fen) {
  const map = {};
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else { map[FILES[f] + (8 - r)] = { c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase() }; f++; }
    }
  });
  return map;
}

export function pieceHtml(p) {
  return `<img src="${pieceUrl(p.c, p.t)}" alt="" draggable="false" data-pc="${p.c}${p.t}">`;
}
// If piece images can't load (offline), fall back to Unicode glyphs.
document.addEventListener('error', e => {
  const img = e.target;
  if (img?.tagName !== 'IMG' || !img.dataset.pc) return;
  const [c, t] = img.dataset.pc;
  const s = document.createElement('span');
  s.className = 'glyph';
  s.textContent = GLYPH[t];
  s.style.cssText = `color:${c === 'w' ? '#fff' : '#111'};-webkit-text-stroke:1px ${c === 'w' ? '#000' : '#888'}`;
  img.replaceWith(s);
}, true);

export class Board {
  /**
   * opts: orientation 'w'|'b', movable(color)->bool, dests(sq)->[sq], onMove(from,to,promo)
   */
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = opts;
    this.orientation = opts.orientation || 'w';
    this.fen = opts.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.lastMove = null;
    this.arrows = [];
    this.marks = {};
    this.badge = null;
    this.selected = null;
    this.drag = null;
    el.classList.add('board-wrap');
    el.innerHTML = `<div class="board"><div class="squares"></div><svg class="arrows" viewBox="0 0 8 8"></svg><div class="promo hidden"></div></div>`;
    this.boardEl = el.querySelector('.board');
    this.sqEl = el.querySelector('.squares');
    this.svg = el.querySelector('.arrows');
    this.promoEl = el.querySelector('.promo');
    this.boardEl.addEventListener('pointerdown', e => this._down(e));
    this.boardEl.addEventListener('contextmenu', e => e.preventDefault());
    this._move = e => this._pmove(e);
    this._up = e => this._pup(e);
    this.render();
  }

  set(o) {
    if (o.fen !== undefined) this.fen = o.fen;
    if (o.lastMove !== undefined) this.lastMove = o.lastMove;
    if (o.arrows !== undefined) this.arrows = o.arrows;
    if (o.marks !== undefined) this.marks = o.marks;
    if (o.badge !== undefined) this.badge = o.badge;
    if (o.orientation !== undefined) this.orientation = o.orientation;
    this.selected = null;
    this.render();
  }
  flip() { this.orientation = this.orientation === 'w' ? 'b' : 'w'; this.render(); }

  sqAt(row, col) {
    const f = this.orientation === 'w' ? col : 7 - col;
    const r = this.orientation === 'w' ? 7 - row : row;
    return FILES[f] + (r + 1);
  }
  rc(sq) {
    const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
    return this.orientation === 'w' ? [7 - r, f] : [r, 7 - f];
  }

  render() {
    const pieces = parseFenBoard(this.fen);
    this.pieces = pieces;
    const turn = this.fen.split(' ')[1];
    const dests = this.selected && this.opts.dests ? this.opts.dests(this.selected) : [];
    let checkSq = null;
    if (this.opts.inCheck?.(this.fen)) {
      checkSq = Object.keys(pieces).find(s => pieces[s].t === 'k' && pieces[s].c === turn);
    }
    let html = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = this.sqAt(row, col);
        // a1 (file 0 + rank 1 = odd) is a dark square
        const light = (FILES.indexOf(sq[0]) + +sq[1]) % 2 === 0;
        const cls = ['sq', light ? 'l' : 'd'];
        if (this.lastMove && (this.lastMove[0] === sq || this.lastMove[1] === sq)) cls.push('last');
        if (this.selected === sq) cls.push('sel');
        if (this.marks[sq]) cls.push(this.marks[sq]);
        if (dests.includes(sq)) cls.push('dest', pieces[sq] ? 'occ' : '');
        if (checkSq === sq) cls.push('check');
        let inner = '';
        if (row === 7) inner += `<span class="coord f">${sq[0]}</span>`;
        if (col === 0) inner += `<span class="coord r">${sq[1]}</span>`;
        if (pieces[sq]) inner += `<div class="pc">${pieceHtml(pieces[sq])}</div>`;
        if (this.badge && this.badge.sq === sq && CLS[this.badge.cls]) {
          const c = CLS[this.badge.cls];
          inner += `<span class="ci bdg" style="background:${c.color}">${c.sym}</span>`;
        }
        html += `<div class="${cls.join(' ')}" data-sq="${sq}">${inner}</div>`;
      }
    }
    this.sqEl.innerHTML = html;
    this.drawArrows();
  }

  drawArrows() {
    let s = '';
    for (const a of this.arrows) {
      if (!a.from || !a.to) continue;
      const [r1, c1] = this.rc(a.from), [r2, c2] = this.rc(a.to);
      const x1 = c1 + .5, y1 = r1 + .5, x2 = c2 + .5, y2 = r2 + .5;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      const hl = .42, hw = .26, w = a.width || .16;
      const bx = x2 - ux * hl, by = y2 - uy * hl;
      const col = a.color || 'rgba(21,120,27,.8)';
      s += `<line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
      s += `<polygon points="${x2},${y2} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}" fill="${col}"/>`;
    }
    this.svg.innerHTML = s;
  }

  _sqFromPoint(x, y) {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-sq]');
    return el && this.sqEl.contains(el) ? el.dataset.sq : null;
  }

  _down(e) {
    if (e.button !== 0) return;
    const sqEl = e.target.closest('[data-sq]');
    if (!sqEl) return;
    const sq = sqEl.dataset.sq;
    const p = this.pieces[sq];
    if (this.selected && this.selected !== sq) {
      const dests = this.opts.dests ? this.opts.dests(this.selected) : [];
      if (dests.includes(sq)) { this._tryMove(this.selected, sq); return; }
    }
    const turn = this.fen.split(' ')[1];
    if (p && p.c === turn && (!this.opts.movable || this.opts.movable(p.c))) {
      const was = this.selected === sq;
      this.selected = sq;
      this.render();
      const rect = this.boardEl.getBoundingClientRect();
      const size = rect.width / 8;
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.style.width = ghost.style.height = size + 'px';
      ghost.innerHTML = pieceHtml(p);
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      document.body.appendChild(ghost);
      this.sqEl.querySelector(`[data-sq="${sq}"] .pc`)?.classList.add('dragging');
      this.drag = { from: sq, ghost, was };
      window.addEventListener('pointermove', this._move);
      window.addEventListener('pointerup', this._up);
      e.preventDefault();
    } else if (this.selected) {
      this.selected = null;
      this.render();
    }
  }
  _pmove(e) {
    if (!this.drag) return;
    this.drag.ghost.style.left = e.clientX + 'px';
    this.drag.ghost.style.top = e.clientY + 'px';
  }
  _pup(e) {
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    if (!this.drag) return;
    const { from, ghost, was } = this.drag;
    ghost.remove();
    this.drag = null;
    const to = this._sqFromPoint(e.clientX, e.clientY);
    if (to && to !== from) {
      const dests = this.opts.dests ? this.opts.dests(from) : [];
      if (dests.includes(to)) { this._tryMove(from, to); return; }
      this.selected = null;
    } else if (to === from && was) {
      this.selected = null; // second click on same piece deselects
    }
    this.render();
  }

  _tryMove(from, to) {
    const p = this.pieces[from];
    this.selected = null;
    if (p && p.t === 'p' && (to[1] === '8' || to[1] === '1')) {
      this._askPromotion(p.c).then(promo => {
        if (promo) this.opts.onMove?.(from, to, promo); else this.render();
      });
      return;
    }
    this.opts.onMove?.(from, to);
  }
  _askPromotion(color) {
    return new Promise(res => {
      this.promoEl.innerHTML = `<div class="opts">${['q', 'r', 'b', 'n'].map(t => `<button data-p="${t}">${pieceHtml({ c: color, t })}</button>`).join('')}</div>`;
      this.promoEl.classList.remove('hidden');
      this.promoEl.onclick = e => {
        const b = e.target.closest('[data-p]');
        this.promoEl.classList.add('hidden');
        res(b ? b.dataset.p : null);
      };
    });
  }
}
