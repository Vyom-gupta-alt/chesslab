// Background analysis queue: analyses games one by one and turns your mistakes into puzzles.
import { state, save, bump } from './store.js';
import { analyzeGame, puzzlesFromGame } from './analysis.js';
import { getEngine } from './engine.js';

export const analyzer = {
  queue: [],
  running: null,
  progress: 0,
  token: null,
  events: new EventTarget(),

  add(ids, front = false) {
    const fresh = ids.filter(id => id !== this.running && !this.queue.includes(id));
    if (front) this.queue.unshift(...fresh); else this.queue.push(...fresh);
    this.emit();
    this.loop();
  },
  cancelAll() {
    this.queue = [];
    if (this.token) this.token.cancelled = true;
    this.emit();
  },
  emit(type = 'update', detail = {}) {
    this.events.dispatchEvent(new CustomEvent(type, { detail: { running: this.running, progress: this.progress, queued: this.queue.length, ...detail } }));
  },
  async loop() {
    if (this.running) return;
    while (this.queue.length) {
      const id = this.running = this.queue.shift();
      this.progress = 0;
      this.token = { cancelled: false };
      this.emit();
      const g = state.games[id];
      if (!g) continue;
      try {
        g.analysis = await analyzeGame(g, {
          engine: getEngine('bulk'), depth: state.settings.depth, useCloud: state.settings.useCloud, token: this.token,
          onProgress: p => { this.progress = p; this.emit(); },
        });
        g.analyzedAt = Date.now();
        for (const p of puzzlesFromGame(g)) {
          const old = state.puzzles[p.id];
          state.puzzles[p.id] = old ? { ...p, box: old.box, due: old.due, attempts: old.attempts, fails: old.fails, solves: old.solves, created: old.created } : p;
        }
        save('games'); save('puzzles');
        bump('analyzed');
        this.emit('gameDone', { id });
      } catch (e) {
        if (e.message !== 'cancelled') { console.error(e); this.emit('gameError', { id, error: e.message }); }
      }
    }
    this.running = null;
    this.progress = 0;
    this.emit();
  },
};
