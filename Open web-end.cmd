@echo off
cd /d "%~dp0"
if not exist "selfhost\node_modules\esbuild" (
  call npm ci --prefix selfhost
  if errorlevel 1 goto failed
)
call npm run build --prefix selfhost
if errorlevel 1 goto failed
call npm run start:local --prefix selfhost
exit /b 0
:failed
echo web-end could not start. Check that Node.js 22.13 or newer is installed.
pause
exit /b 1
