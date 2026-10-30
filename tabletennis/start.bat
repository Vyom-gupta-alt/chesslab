@echo off
rem TT Analyzer - one-click start for Windows.
rem Needs: Python 3.10-3.12 (python.org, tick "Add python.exe to PATH")
rem        and FFmpeg (in PowerShell: winget install Gyan.FFmpeg)
setlocal
cd /d "%~dp0"

where python >nul 2>nul || (
  echo Python not found. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
  pause & exit /b 1
)
where ffmpeg >nul 2>nul || (
  echo FFmpeg not found. Open PowerShell and run:  winget install Gyan.FFmpeg
  echo Then close this window and double-click start.bat again.
  pause & exit /b 1
)

if not exist .venv (
  echo First run: installing. This takes a few minutes...
  python -m venv .venv || (echo Could not create a virtual environment. & pause & exit /b 1)
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip >nul
  pip install -e "ml_pipeline[pose]" || (
    echo Pose analysis could not be installed; rallies will still be cut but strokes won't be tagged.
    pip install -e ml_pipeline
  )
  pip install -e backend || (echo Installing the server failed. & pause & exit /b 1)
) else (
  call .venv\Scripts\activate.bat
)

if not exist frontend\out\index.html (
  where npm >nul 2>nul && (pushd frontend & call npm install & call npm run build & popd)
)

echo.
echo   TT Analyzer is running at  http://localhost:8000
echo   Keep this window open while you use it. Close it to stop.
echo.
start "" http://localhost:8000
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
