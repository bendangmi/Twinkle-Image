@echo off
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=3000"
set "HOST_NAME=%~2"
if "%HOST_NAME%"=="" set "HOST_NAME=0.0.0.0"

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  set "NODE=node"
) else (
  set "NODE=C:\Users\14740\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

set "NODE_ENV=production"
set "PORT=%PORT%"
set "HOSTNAME=%HOST_NAME%"
set "NOVA_TASK_DB=%ROOT%\data\nova-tasks.sqlite"
set "NOVA_IMAGE_DIR=%ROOT%\data\nova-images"

echo Starting Twinkle Image...
echo URL: http://localhost:%PORT%
echo Host: %HOST_NAME%
echo Node: %NODE%
echo.

%NODE% backend\server.js

echo.
echo Server stopped with exit code %ERRORLEVEL%.
pause
