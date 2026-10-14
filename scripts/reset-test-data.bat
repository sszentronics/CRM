@echo off
rem Double-click to wipe the local CRM database and load the clean test teams (Owner, Admin, Teams A-D).
cd /d "%~dp0\.."
(
echo === %date% %time% ===
docker ps >nul 2>&1
if errorlevel 1 echo DOCKER IS NOT RUNNING - open Docker Desktop, wait for "Engine running", then run this again.
call pnpm db:start
call pnpm db:reset
call node scripts/seed-testing.mjs
echo SEED_EXIT=%errorlevel%
) > reset-log.txt 2>&1
type reset-log.txt
echo.
type .seed-credentials.local
pause
