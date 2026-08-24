@echo off
setlocal

set "FRONTEND_PORT=%~1"
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=3100"
set "BACKEND_PORT=%~2"
if "%BACKEND_PORT%"=="" set "BACKEND_PORT=3101"
set "HOST_NAME=%~3"
if "%HOST_NAME%"=="" set "HOST_NAME=127.0.0.1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-dev.ps1" -FrontendPort %FRONTEND_PORT% -BackendPort %BACKEND_PORT% -HostName "%HOST_NAME%"
if errorlevel 1 (
  echo.
  echo Local development servers failed to start.
  exit /b %ERRORLEVEL%
)

endlocal
