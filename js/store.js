// Persistent app state backed by IndexedDB (falls back to memory if unavailable).
import { todayKey } from './ui.js';
import { tagOpenings } from './openings.js';

const DB = 'chesslab', STORE = 'kv';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idbGet(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

export const DEFAULT_SETTINGS = {
  chesscomUser: '', lichessUser: '', depth: 14, depthChosen: false, useCloud: true, autoSync: true,
  puzzleDifficulty: 'normal', boardTheme: 'green', lastSync: {},
};

export const state = {
  games: {},        // id -> game
  puzzles: {},      // id -> puzzle generated from your mistakes
  settings: { ...DEFAULT_SETTINGS },
  goals: [],
  pstats: { rating: 1500, themes: {}, history: [] }, // puzzle stats
  activity: {},     // yyyy-mm-dd -> { puzzles, solved, analyzed }
  repertoire: {},   // id -> opening line you're memorising (spaced repetition)
};
export const KEYS = ['games', 'puzzles', 'settings', 'goals', 'pstats', 'activity', 'repertoire'];

export async function loadAll() {
  try {
    for (const k of KEYS) {
      const v = await idbGet(k);
      if (v !== undefined) state[k] = k === 'settings' ? { ...DEFAULT_SETTINGS, ...v } : v;
    }
    if (!state.settings.depthChosen) state.settings.depth = DEFAULT_SETTINGS.depth;
  } catch (e) { console.warn('Storage unavailable, running in memory', e); }
}

/** Wipe everything this browser has stored (games, analysis, puzzles, goals, usernames). */
export async function resetAll() {
  Object.assign(state, {
    games: {}, puzzles: {}, goals: [], activity: {}, repertoire: {},
    pstats: { rating: 1500, themes: {}, history: [] }, settings: { ...DEFAULT_SETTINGS, lastSync: {} },
  });
  for (const k of KEYS) await idbSet(k, state[k]);
}

const timers = {};
export function save(key) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => idbSet(key, state[key]).catch(e => console.warn('save failed', key, e)), 300);
}
export function saveNow(key) { return idbSet(key, state[key]); }

export function bump(field, n = 1) {
  const k = todayKey();
  const a = state.activity[k] || (state.activity[k] = { puzzles: 0, solved: 0, analyzed: 0 });
  a[field] = (a[field] || 0) + n;
  save('activity');
}

// Games helpers
export function addGames(list) {
  const fresh = list.filter(g => !state.games[g.id]);
  for (const g of fresh) state.games[g.id] = g;
  if (fresh.length) {
    save('games');
    tagOpenings(fresh).then(() => save('games'));
  }
  return fresh.length;
}
export const openingName = g => g.openingBook?.name || g.opening || null;
export const allGames = () => Object.values(state.games).sort((a, b) => b.date - a.date);
export const myGames = () => allGames().filter(g => g.userColor);

export function userResult(g) {
  if (!g.userColor) return null;
  if (g.result === '1/2-1/2') return 'draw';
  if (g.result === '1-0') return g.userColor === 'w' ? 'win' : 'loss';
  if (g.result === '0-1') return g.userColor === 'b' ? 'win' : 'loss';
  return null;
}
