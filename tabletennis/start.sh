#!/usr/bin/env bash
# TT Analyzer - one-command start for macOS / Linux.
# Needs: Python 3.10+ and FFmpeg
#   macOS:  brew install python ffmpeg
#   Ubuntu: sudo apt install python3-venv ffmpeg libegl1 libgles2
set -euo pipefail
cd "$(dirname "$0")"

command -v python3 >/dev/null || { echo "Python 3 not found. Install it first."; exit 1; }
command -v ffmpeg >/dev/null || { echo "FFmpeg not found. macOS: brew install ffmpeg   Ubuntu: sudo apt install ffmpeg"; exit 1; }

if [ ! -d .venv ]; then
  echo "First run: installing. This takes a few minutes..."
  python3 -m venv .venv
  . .venv/bin/activate
  python -m pip install --upgrade pip >/dev/null
  pip install -e "ml_pipeline[pose]" || {
    echo "Pose analysis could not be installed; rallies will still be cut but strokes won't be tagged."
    pip install -e ml_pipeline
  }
  pip install -e backend
else
  . .venv/bin/activate
fi

if [ ! -f frontend/out/index.html ] && command -v npm >/dev/null; then
  (cd frontend && npm install && npm run build)
fi

echo
echo "  TT Analyzer is running at http://localhost:8000"
echo "  Press Ctrl+C to stop."
echo
( sleep 2; (command -v open >/dev/null && open http://localhost:8000) \
  || (command -v xdg-open >/dev/null && xdg-open http://localhost:8000) || true ) >/dev/null 2>&1 &
cd backend
exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
