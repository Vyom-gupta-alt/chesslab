# ♞ ChessLab

A free, all-in-one chess improvement site that runs entirely in your browser. Import your games from
Chess.com or Lichess by username, get a full Stockfish review, and train on your own mistakes.

## Features

- **Import by username** from Chess.com and Lichess (no downloading), or paste a PGN. New games auto-sync.
- **Game review**: accuracy, move labels (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy,
  Mistake, Miss, Blunder), eval bar and graph, retry your mistakes, explore variations, and a
  **"Why was this move bad?"** coach explanation.
- **🔥 Rating Check**: the rating you *actually* played at in each game vs your real rating, with brutally
  honest verdicts.
- **Coach**: five-area score (Tactics, Blunders, Conversion, Clock, Openings), why you lose each game, and
  drills built from your mistakes (Finish the win, Fight back, Spot the trap, Rushed moves).
- **Puzzles**: every mistake becomes a puzzle with spaced repetition, plus similar Lichess puzzles by
  tactical theme, a weakness trainer, and a daily puzzle.
- **Openings**: the lines you really play and how you score in them, a library of 3,800+ named lines, and
  a learn/drill trainer for your repertoire.
- **Dashboard & Goals**: rating and accuracy charts, opening stats, insights, a daily plan, and goals that
  track themselves.

All your data stays in your own browser (IndexedDB). Use **Settings → Export backup** to move it.

## Run it locally

Requires [Node.js](https://nodejs.org). No install step.

```
node server.js
```

Then open http://localhost:5173. On Windows you can just double-click `start.bat`.

It's a plain static site, so it also works on any static host (e.g. GitHub Pages).

## How it works

- **Engine**: Stockfish 10 (WebAssembly) running in a Web Worker — `js/vendor/`.
- **Games**: the public Chess.com (`api.chess.com/pub`) and Lichess (`lichess.org/api`) APIs, called from
  the browser.
- **Accuracy**: Lichess's win-percentage formula; move labels come from win-% lost.
- **Tactic detection**: forks, pins, skewers, discovered attacks, hanging pieces, mates and more are
  detected from the engine line and used to tag puzzles and find your weaknesses.

## Credits & licences

- [Stockfish](https://stockfishchess.org) via [stockfish.js](https://github.com/nmrugg/stockfish.js) — GPL-3.0
- Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) — CC0
- [chess.js](https://github.com/jhlywa/chess.js) — BSD-2-Clause; [Chart.js](https://www.chartjs.org) — MIT
- Piece images (cburnett) are loaded from Lichess; puzzles and cloud evals from the Lichess API.

Because it bundles Stockfish, ChessLab is released under the **GNU GPL v3** — see [LICENSE](LICENSE).
Not affiliated with Chess.com or Lichess.
