// Stockfish running locally in a Web Worker.
// Prefer the WebAssembly build (vendored, same origin so it can find its .wasm file);
// fall back to the slower pure-JS build from the CDN.
const SF_WASM = new URL('./vendor/stockfish.wasm.js', import.meta.url).href;
const SF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';

function makeWorker() {
  if (typeof WebAssembly === 'object') {
    try { return new Worker(SF_WASM); } catch { /* fall through */ }
  }
  const blob = new Blob([`importScripts('${SF_URL}');`], { type: 'text/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

function parseInfo(line, turn) {
  if (!line.startsWith('info') || !line.includes(' pv ') || line.includes('bound')) return null;
  const t = line.split(' ');
  const get = k => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : null; };
  const depth = +get('depth');
  const multipv = +(get('multipv') || 1);
  const si = t.indexOf('score');
  if (si < 0) return null;
  const sign = turn === 'w' ? 1 : -1;
  const score = t[si + 1] === 'mate' ? { mate: sign * +t[si + 2] } : { cp: sign * +t[si + 2] };
  const pv = t.slice(t.indexOf('pv') + 1);
  return { depth, multipv, score, pv };
}

export class Engine {
  constructor() {
    this.worker = makeWorker();
    this.listeners = [];
    this.worker.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      for (const l of [...this.listeners]) l(line);
    };
    this.chain = Promise.resolve();
    this.ready = this._init();
  }
  send(cmd) { this.worker.postMessage(cmd); }
  waitFor(pred) {
    return new Promise(res => {
      const l = line => { if (pred(line)) { this.listeners = this.listeners.filter(x => x !== l); res(line); } };
      this.listeners.push(l);
    });
  }
  async _init() {
    this.send('uci');
    await this.waitFor(l => l === 'uciok');
    this.send('setoption name Hash value 32');
    this.send('isready');
    await this.waitFor(l => l === 'readyok');
  }
  /**
   * Analyse a position. Scores are returned from White's point of view.
   * opts: { depth, multipv, infinite, onInfo(lines), token:{cancelled} }
   */
  analyze(fen, opts = {}) {
    const { depth = 14, multipv = 1, infinite = false, onInfo, token } = opts;
    const job = async () => {
      await this.ready;
      if (token?.cancelled) return null;
      const turn = fen.split(' ')[1];
      const lines = {};
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send('isready');
      await this.waitFor(l => l === 'readyok');
      if (token?.cancelled) return null;
      const sorted = () => Object.values(lines).sort((a, b) => a.multipv - b.multipv);
      const onLine = line => {
        const p = parseInfo(line, turn);
        if (p) { lines[p.multipv] = p; onInfo?.(sorted()); }
      };
      this.listeners.push(onLine);
      this.send('position fen ' + fen);
      this.send(infinite ? 'go infinite' : `go depth ${depth}`);
      if (token) token.stop = () => this.send('stop');
      const bm = await this.waitFor(l => l.startsWith('bestmove'));
      this.listeners = this.listeners.filter(x => x !== onLine);
      return { lines: sorted(), bestmove: bm.split(' ')[1] };
    };
    const p = this.chain.then(job);
    this.chain = p.catch(() => {});
    return p;
  }
}

const engines = {};
export function getEngine(name = 'main') {
  return engines[name] || (engines[name] = new Engine());
}

/** Live analysis helper: cancels the previous search whenever a new position comes in. */
export class LiveAnalyzer {
  constructor(name = 'live') { this.engine = getEngine(name); this.token = null; }
  start(fen, { multipv = 3, maxDepth = 22, onInfo }) {
    this.stop();
    const token = this.token = { cancelled: false };
    this.engine.analyze(fen, {
      multipv, infinite: true, token,
      onInfo: lines => {
        if (token.cancelled) return;
        onInfo(lines);
        if (lines[0]?.depth >= maxDepth) token.stop?.();
      },
    });
  }
  stop() {
    if (this.token) { this.token.cancelled = true; this.token.stop?.(); this.token = null; }
  }
}
