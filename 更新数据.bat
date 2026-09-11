@echo off
rem ===========================================================================
rem  WowAltBoard reference-data updater
rem
rem  Contents are deliberately pure ASCII -- same reason as the launcher
rem  console codepage here is 936 and Chinese text in a .bat mangles. All
rem  Chinese user-facing text lives in the panel itself.
rem
rem  Refreshes every static reference file the bis/talents panel reads, in
rem  dependency order. Needs internet. The slowest step (raider.io, ~47 min,
rem  rate-limited on purpose) can be skipped:
rem
rem      this .bat -SkipRio
rem
rem  %~dp0 so this works from any CWD (double-click, "Run as administrator",
rem  shortcuts -- see the launcher .bat for the full story).
rem ===========================================================================

setlocal
set "HERE=%~dp0"

echo.
echo Updating WowAltBoard reference data (needs internet)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%tools\update-bis-data.ps1" %*
set "EC=%ERRORLEVEL%"

echo.
if "%EC%"=="0" (
  echo ---------------------------------------------------------------
  echo  Done. Verify with:  node tools\run-tests.js
  echo  Then restart the dashboard - the page reads these files at
  echo  load time and will not pick them up until it reloads.
  echo ---------------------------------------------------------------
) else (
  echo ---------------------------------------------------------------
  echo  EXIT CODE %EC% - at least one step failed; the list above says
  echo  which. The bundled copies are still in place, nothing was lost.
  echo ---------------------------------------------------------------
)
echo.
pause
exit /b %EC%
