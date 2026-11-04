@echo off
rem ============================================================
rem  STREET CENSUS / Nebula Survey - one click launcher
rem  Starts a local server with Windows built-in PowerShell
rem  (no Python needed) and opens the browser automatically.
rem ============================================================
setlocal
cd /d "%~dp0"

set "PORTFILE=%TEMP%\street_census_port.txt"
if exist "%PORTFILE%" del "%PORTFILE%" >nul 2>nul

start "street-census-server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -PortFile "%PORTFILE%"

rem -- wait until the server reports its port (max ~12s) -------
set /a TRIES=0
:waitport
timeout /t 1 /nobreak >nul
if exist "%PORTFILE%" goto open
set /a TRIES+=1
if %TRIES% LSS 12 goto waitport

echo.
echo  Could not start the local server.
echo  Please read readme.txt for the manual start method.
pause
exit /b 1

:open
set /p URL=<"%PORTFILE%"
start "" "%URL%"
endlocal
exit /b 0
