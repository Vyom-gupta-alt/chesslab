// Lightweight tactical motif detection used to tag mistakes with puzzle themes.
import { Chess } from './lib.js';

export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const FILES = 'abcdefgh';
export const sqIdx = s => (s.charCodeAt(0) - 97) + (+s[1] - 1) * 8;
export const idxSq = i => FILES[i % 8] + (((i / 8) | 0) + 1);

export function boardFromFen(fen) {
  const b = new Array(64).fill(null);
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else { b[(7 - r) * 8 + f] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b' }; f++; }
    }
  });
  return b;
}

const D = {
  n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
  k: [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
};
const slideDirs = t => t === 'b' ? D.b : t === 'r' ? D.r : t === 'q' ? [...D.b, ...D.r] : [];

export function attacksFrom(b, i) {
  const p = b[i];
  if (!p) return [];
  const f = i % 8, r = (i / 8) | 0, out = [];
  const ok = (ff, rr) => ff >= 0 && ff < 8 && rr >= 0 && rr < 8;
  if (p.t === 'p') {
    const d = p.c === 'w' ? 1 : -1;
    for (const df of [-1, 1]) if (ok(f + df, r + d)) out.push((r + d) * 8 + f + df);
    return out;
  }
  if (p.t === 'n' || p.t === 'k') {
    for (const [df, dr] of D[p.t]) if (ok(f + df, r + dr)) out.push((r + dr) * 8 + f + df);
    return out;
  }
  for (const [df, dr] of slideDirs(p.t)) {
    let ff = f + df, rr = r + dr;
    while (ok(ff, rr)) {
      const j = rr * 8 + ff;
      out.push(j);
      if (b[j]) break;
      ff += df; rr += dr;
    }
  }
  return out;
}

export function attackers(b, i, color) {
  const res = [];
  for (let j = 0; j < 64; j++) if (b[j] && b[j].c === color && attacksFrom(b, j).includes(i)) res.push(j);
  return res;
}

/** True if the piece on square i can be won by the opponent (undefended or attacked by something cheaper). */
export function isEnPrise(b, i) {
  const p = b[i];
  if (!p || p.t === 'k') return false;
  const opp = p.c === 'w' ? 'b' : 'w';
  const att = attackers(b, i, opp);
  if (!att.length) return false;
  const def = attackers(b, i, p.c);
  if (!def.length) return true;
  return Math.min(...att.map(j => VAL[b[j].t])) < VAL[p.t];
}

const uciMove = uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

/**
 * Detect tactical themes for the side to move playing the engine line `pv` from `fen`.
 * mateIn > 0 means the side to move has a forced mate in that many moves.
 */
export function detectThemes(fen, pv, { mateIn = 0, winAfter = 50, ply = 0 } = {}) {
  const themes = new Set();
  if (!pv || !pv.length) return [];
  const c = new Chess(fen);
  const me = c.turn(), opp = me === 'w' ? 'b' : 'w';
  const before = boardFromFen(fen);
  let m;
  try { m = c.move(uciMove(pv[0])); } catch { return []; }
  const after = boardFromFen(c.fen());
  const to = sqIdx(m.to), from = sqIdx(m.from);
  const moved = after[to];

  if (mateIn > 0) {
    themes.add(mateIn <= 4 ? 'mateIn' + mateIn : 'mateIn5');
    // back-rank: final mating move delivered by a rook/queen along the king's home rank
    try {
      const t = new Chess(fen);
      for (const u of pv.slice(0, mateIn * 2 - 1)) t.move(uciMove(u));
      if (t.isCheckmate()) {
        const fb = boardFromFen(t.fen());
        const k = fb.findIndex(p => p && p.t === 'k' && p.c === opp);
        const kr = (k / 8) | 0;
        if ((opp === 'w' && kr === 0) || (opp === 'b' && kr === 7)) themes.add('backRankMate');
      }
    } catch { /* ignore */ }
  }

  if (m.promotion) themes.add('promotion');
  else {
    // promotion a few plies later in the line
    try {
      const t = new Chess(fen);
      for (const u of pv.slice(0, 5)) { const mm = t.move(uciMove(u)); if (mm.promotion && mm.color === me) { themes.add('advancedPawn'); break; } }
    } catch { /* ignore */ }
  }

  if (m.captured) {
    const defended = attackers(before, to, opp).length > 0;
    if (!defended || VAL[m.captured] > VAL[m.piece]) themes.add('hangingPiece');
  }

  // Fork: moved piece attacks two or more valuable/undefended targets
  if (moved) {
    const targets = attacksFrom(after, to).filter(j => {
      const p = after[j];
      if (!p || p.c !== opp) return false;
      if (p.t === 'k') return true;
      return VAL[p.t] > VAL[moved.t] || (VAL[p.t] >= 3 && attackers(after, j, opp).length === 0);
    });
    if (targets.length >= 2 && !isEnPriseCheap(after, to)) themes.add('fork');
  }

  // Discovered attack: another of my pieces newly attacks something valuable
  for (let j = 0; j < 64; j++) {
    const p = after[j];
    if (!p || p.c !== me || j === to || !['b', 'r', 'q'].includes(p.t)) continue;
    const nowAtt = attacksFrom(after, j).filter(k => after[k] && after[k].c === opp && (after[k].t === 'k' || VAL[after[k].t] >= 5));
    const was = attacksFrom(before, j);
    if (nowAtt.some(k => !was.includes(k))) { themes.add('discoveredAttack'); break; }
  }

  // Pin / skewer along the moved slider's lines
  if (moved && slideDirs(moved.t).length) {
    const f0 = to % 8, r0 = (to / 8) | 0;
    for (const [df, dr] of slideDirs(moved.t)) {
      let ff = f0 + df, rr = r0 + dr, first = null;
      while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
        const p = after[rr * 8 + ff];
        if (p) {
          if (p.c !== opp) break;
          if (!first) first = p;
          else {
            if ((p.t === 'k' || VAL[p.t] > VAL[first.t]) && first.t !== 'k') themes.add('pin');
            else if ((first.t === 'k' || VAL[first.t] > VAL[p.t]) && VAL[p.t] >= 3) themes.add('skewer');
            break;
          }
        }
        ff += df; rr += dr;
      }
    }
  }

  // Sacrifice: gives up material for the attack
  if (moved && moved.t !== 'p' && isEnPrise(after, to) && (!m.captured || VAL[m.captured] < VAL[m.piece])) themes.add('sacrifice');

  if (c.inCheck() && attackers(after, after.findIndex(p => p && p.t === 'k' && p.c === opp), me).length >= 2) themes.add('doubleCheck');

  const tactical = themes.size > 0;
  if (!tactical && !m.captured && !m.san.includes('+')) themes.add(winAfter < 60 ? 'defensiveMove' : 'quietMove');

  // Phase + outcome themes (also valid Lichess puzzle angles)
  const ph = phaseOf(fen, ply);
  themes.add(ph);
  if (ph === 'endgame') {
    const kinds = new Set(before.filter(p => p && p.t !== 'k').map(p => p.t));
    if ([...kinds].every(k => k === 'p')) themes.add('pawnEndgame');
    else if ([...kinds].every(k => k === 'p' || k === 'r')) themes.add('rookEndgame');
  }
  if (!mateIn) themes.add(winAfter >= 90 ? 'crushing' : winAfter >= 62 ? 'advantage' : 'equality');
  return [...themes];
}

function isEnPriseCheap(b, i) {
  // a fork that just loses the forking piece to a pawn isn't much of a fork
  const p = b[i], opp = p.c === 'w' ? 'b' : 'w';
  return attackers(b, i, opp).some(j => b[j].t === 'p') && p.t !== 'p';
}

export function phaseOf(fen, ply = 0) {
  const b = boardFromFen(fen);
  let mat = 0, minorsDeveloped = 0;
  for (const p of b) if (p && p.t !== 'k' && p.t !== 'p') mat += VAL[p.t];
  if (mat <= 26) return 'endgame';
  // count undeveloped back-rank minors
  const back = [1, 2, 5, 6].map(f => b[f]).concat([57, 58, 61, 62].map(i => b[i]));
  minorsDeveloped = back.filter(p => !p || !['n', 'b'].includes(p.t)).length;
  if (ply < 20 && minorsDeveloped < 6) return 'opening';
  return 'middlegame';
}

// Priority for picking the single "headline" theme of a mistake
export const THEME_PRIORITY = ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'backRankMate', 'fork', 'pin', 'skewer',
  'discoveredAttack', 'doubleCheck', 'hangingPiece', 'sacrifice', 'promotion', 'advancedPawn', 'defensiveMove',
  'pawnEndgame', 'rookEndgame', 'quietMove', 'endgame', 'crushing', 'advantage', 'opening', 'middlegame', 'equality'];
export const TACTICAL = new Set(THEME_PRIORITY.slice(0, 15));
export function primaryTheme(themes = []) {
  for (const t of THEME_PRIORITY) if (themes.includes(t)) return t;
  return themes[0] || 'mix';
}
