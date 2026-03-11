@echo off
set SCRIPT_DIR=%~dp0
set PS1=%SCRIPT_DIR%Start-LocalGolfStack.ps1
if not exist "%PS1%" (
  echo.
  echo Missing launcher script: "%PS1%"
  echo Recreate Start-LocalGolfStack.ps1, then run this again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
if errorlevel 1 (
  echo.
  echo Failed to start local stack.
  pause
  exit /b 1
)
