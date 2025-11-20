@echo off
title CE Board Exam Generator – Auto Push
echo =====================================================
echo     CE BOARD EXAM GENERATOR – AUTO DEPLOY SCRIPT
echo =====================================================
echo.

:: ==== STEP 0: Use the folder where THIS script is located ====
echo Detecting project folder...
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
echo Working directory: %CD%
echo.

:: ==== STEP 1: Generate list.json (if exists) ====
if exist "%CD%\generateList.js" (
    echo Running generateList.js...
    node "%CD%\generateList.js"
    if errorlevel 1 (
        echo ERROR: Node.js script failed.
        pause
        exit /b
    )
    echo list.json generated successfully.
) else (
    echo generateList.js not found - skipping generation.
)
echo.

:: ==== STEP 2: Ensure correct Git remote (one-time persistence) ====
echo Ensuring correct Git remote...
git remote set-url origin https://github.com/Janclaydez/CEBoardexam-randomizer.git
echo Remote configured.
echo.

:: ==== STEP 3: Git add / commit / push ====
echo Checking for changes...
git add -A
git diff --cached --exit-code >nul 2>&1

if "%errorlevel%"=="0" (
    echo No changes detected. Nothing to push.
    goto done
)

set CURRENT_TIME=%time%
git commit -m "Frontend update (auto) – %CURRENT_TIME%"
if errorlevel 1 (
    echo Nothing committed or commit failed.
    goto done
)

echo Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo ERROR: Git push failed. Check internet or GitHub login.
    pause
    exit /b
)

echo Push completed successfully.

:done
echo.
echo =====================================================
echo All tasks completed successfully!
echo =====================================================
pause
