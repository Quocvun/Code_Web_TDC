@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Can Node.js 20.9 tro len. Tai tai: https://nodejs.org/
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo Chua tim thay pnpm. Cai pnpm bang Corepack: corepack enable
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Dang cai dependency cho MeoTDC...
  call pnpm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Dang khoi dong MeoTDC. Mo http://localhost:3000 sau khi server san sang.
call pnpm dev
pause
