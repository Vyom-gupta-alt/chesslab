@echo off
REM Double-click to run IB Assess at http://localhost:3000
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages, this takes a minute the first time...
  call npm install
)
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
npm run dev
