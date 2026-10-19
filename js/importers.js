// Pull games straight from the public Chess.com and Lichess APIs (no downloads needed).
import { state, addGames, save } from './store.js';

export function pgnHeaders(pgn) {
  const h = {};
  for (const m of pgn.matchAll(/\[(\w+)\s+"([^"]*)"\]/g)) h[m[1]] = m[2];
  return h;
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function openingFromEcoUrl(url) {
  if (!url) return null;
  const words = decodeURIComponent(url.split('/').pop()).split('-');
  const out = [];
  for (const w of words) { if (/^\d+\.|\.\.\./.test(w) || /^\d/.test(w)) break; out.push(w); }
  return out.join(' ') || null;
}

/** Short opening family, e.g. "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense". */
export function openingFamily(name) {
  if (!name) return 'Unknown';
  const n = name.split(/[:,]/)[0].trim();
  const m = n.match(/^(.*?\b(Defense|Defence|Game|Opening|Gambit|Attack|System|Variation))\b/);
  return (m ? m[1] : n.split(' ').slice(0, 3).join(' ')).replace(/'/g, '');
}

function mapChessCom(g, user) {
  const hdr = pgnHeaders(g.pgn);
  const w = g.white.username.toLowerCase(), b = g.black.username.toLowerCase();
  return {
    id: 'cc_' + (g.uuid || g.url.split('/').pop()), source: 'chesscom', url: g.url, pgn: g.pgn,
    white: g.white.username, black: g.black.username, whiteElo: g.white.rating, blackElo: g.black.rating,
    result: hdr.Result || '*', date: (g.end_time || 0) * 1000, timeClass: g.time_class, timeControl: g.time_control,
    rated: g.rated, opening: openingFromEcoUrl(hdr.ECOUrl) || hdr.Opening || null, eco: hdr.ECO || null,
    userColor: w === user ? 'w' : b === user ? 'b' : null, platformAccuracy: g.accuracies || null,
    termination: hdr.Termination || '',
  };
}

export async function importChessCom(username, { months = 3, onProgress } = {}) {
  const user = username.trim().toLowerCase();
  if (!user) throw new Error('Enter a Chess.com username');
  const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`);
  if (r.status === 404) throw new Error(`Chess.com user "${username}" not found`);
  if (!r.ok) throw new Error(`Chess.com returned ${r.status}`);
  const { archives = [] } = await r.json();
  const list = months === 'all' ? archives : archives.slice(-months);
  const games = [];
  for (let i = list.length - 1, n = 0; i >= 0; i--, n++) {
    onProgress?.(`Fetching ${list[i].split('/').slice(-2).join('/')} (${n + 1}/${list.length})…`);
    const res = await fetch(list[i]);
    if (!res.ok) continue;
    const j = await res.json();
    for (const g of j.games || []) if (g.rules === 'chess' && g.pgn) games.push(mapChessCom(g, user));
  }
  return games;
}

function mapLichess(g, user) {
  const pl = c => g.players[c].user?.name || (g.players[c].aiLevel ? `Stockfish lvl ${g.players[c].aiLevel}` : 'Anonymous');
  const w = pl('white'), b = pl('black');
  return {
    id: 'li_' + g.id, source: 'lichess', url: 'https://lichess.org/' + g.id, pgn: g.pgn,
    white: w, black: b, whiteElo: g.players.white.rating, blackElo: g.players.black.rating,
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2',
    date: g.lastMoveAt || g.createdAt, timeClass: g.speed === 'correspondence' ? 'daily' : g.speed,
    timeControl: g.clock ? `${g.clock.initial}+${g.clock.increment}` : '-', rated: g.rated,
    opening: g.opening?.name || null, eco: g.opening?.eco || null,
    userColor: w.toLowerCase() === user ? 'w' : b.toLowerCase() === user ? 'b' : null,
    platformAccuracy: g.players.white.analysis ? { white: g.players.white.analysis.accuracy, black: g.players.black.analysis?.accuracy } : null,
    termination: g.status,
  };
}

export async function importLichess(username, { max = 100, perfType = '', since, onProgress } = {}) {
  const user = username.trim().toLowerCase();
  if (!user) throw new Error('Enter a Lichess username');
  const p = new URLSearchParams({ max, pgnInJson: 'true', opening: 'true', clocks: 'true', accuracy: 'true' });
  if (perfType) p.set('perfType', perfType);
  if (since) p.set('since', since);
  onProgress?.('Downloading games from Lichess…');
  const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${p}`, { headers: { Accept: 'application/x-ndjson' } });
  if (r.status === 404) throw new Error(`Lichess user "${username}" not found`);
  if (r.status === 429) throw new Error('Lichess rate limit hit — wait a minute and try again');
  if (!r.ok) throw new Error(`Lichess returned ${r.status}`);
  const text = await r.text();
  const games = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    if (g.variant !== 'standard' || !g.pgn || !g.moves || ['created', 'started', 'aborted', 'noStart'].includes(g.status)) continue;
    games.push(mapLichess(g, user));
  }
  return games;
}

export function importPgnText(text, side = 'auto') {
  const chunks = text.replace(/\r/g, '').split(/\n\s*\n(?=\s*\[Event )/).map(s => s.trim()).filter(Boolean);
  const names = [state.settings.chesscomUser, state.settings.lichessUser].filter(Boolean).map(s => s.toLowerCase());
  return chunks.map(pgn => {
    const h = pgnHeaders(pgn);
    const w = h.White || 'White', b = h.Black || 'Black';
    let userColor = side === 'w' || side === 'b' ? side : null;
    if (side === 'auto') userColor = names.includes(w.toLowerCase()) ? 'w' : names.includes(b.toLowerCase()) ? 'b' : null;
    const d = (h.UTCDate || h.Date || '').replace(/\./g, '-');
    const date = Date.parse(d) || Date.now();
    return {
      id: 'pgn_' + hash(pgn), source: 'pgn', url: h.Site?.startsWith('http') ? h.Site : null, pgn,
      white: w, black: b, whiteElo: +h.WhiteElo || null, blackElo: +h.BlackElo || null, result: h.Result || '*',
      date, timeClass: guessTimeClass(h.TimeControl), timeControl: h.TimeControl || '-', rated: false,
      opening: h.Opening || openingFromEcoUrl(h.ECOUrl), eco: h.ECO || null, userColor, termination: h.Termination || '',
    };
  });
}

function guessTimeClass(tc) {
  if (!tc || tc === '-') return 'classical';
  const [base, inc = 0] = tc.split('+').map(Number);
  const est = base + 40 * inc;
  return est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : 'classical';
}

/** Fetch recent games for the saved usernames. */
export async function syncAccounts({ onProgress } = {}) {
  const s = state.settings;
  let added = 0;
  const errors = [];
  if (s.chesscomUser) {
    try {
      const months = s.lastSync.chesscom ? 2 : 3;
      added += addGames(await importChessCom(s.chesscomUser, { months, onProgress }));
      s.lastSync.chesscom = Date.now();
    } catch (e) { errors.push(e.message); }
  }
  if (s.lichessUser) {
    try {
      const since = s.lastSync.lichess ? s.lastSync.lichess - 86400000 : undefined;
      added += addGames(await importLichess(s.lichessUser, { max: since ? 300 : 100, since, onProgress }));
      s.lastSync.lichess = Date.now();
    } catch (e) { errors.push(e.message); }
  }
  save('settings');
  return { added, errors };
}
