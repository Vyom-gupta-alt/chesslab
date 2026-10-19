// Opening book built from the Lichess chess-openings database (CC0): position -> "ECO|Name".
import { Chess } from './lib.js';

let book = null, loading = null;
export const epd = fen => fen.split(' ').slice(0, 4).join(' ');

export function loadBook() {
  if (book) return Promise.resolve(book);
  if (!loading) loading = fetch(new URL('./data/openings.json', import.meta.url)).then(r => r.json()).then(b => (book = b)).catch(() => (book = {}));
  return loading;
}
export const inBook = fen => !!book && epd(fen) in book;

/** Deepest named opening reached by a sequence of positions. */
export function openingOf(fens) {
  if (!book) return null;
  let found = null;
  for (const f of fens.slice(1, 40)) {
    const v = book[epd(f)];
    if (v === undefined) break;
    if (v) found = v;
  }
  if (!found) return null;
  const [eco, name] = found.split('|');
  return { eco, name };
}

/** Tag games with an exact opening name from the book (consistent across Chess.com/Lichess/PGN). */
export async function tagOpenings(games) {
  await loadBook();
  let n = 0;
  for (const g of games) {
    if (g.openingBookV === 2) continue;
    g.openingBookV = 2;
    try {
      const c = new Chess();
      c.loadPgn(g.pgn);
      const r = new Chess((c.getHeaders ? c.getHeaders() : c.header()).FEN || undefined);
      const fens = [r.fen()];
      for (const m of c.history({ verbose: true }).slice(0, 40)) { r.move({ from: m.from, to: m.to, promotion: m.promotion }); fens.push(r.fen()); }
      g.openingBook = openingOf(fens);
    } catch { g.openingBook = null; }
    n++;
  }
  return n;
}
