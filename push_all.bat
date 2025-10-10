@echo off
title CE Board Exam Generator – Push Frontend
echo =====================================================
echo     CE BOARD EXAM GENERATOR – AUTO DEPLOY SCRIPT
echo =====================================================
echo.

:: STEP 0: Select folder depending on computer
echo Detecting device environment...

set "FOLDER_PATH="

if /I "%COMPUTERNAME%"=="DESKTOP-1B6B2Q7" set "FOLDER_PATH=C:\Users\USER\CEBoardexam-randomizer"
if /I "%COMPUTERNAME%"=="CLIDE-LAPTOP" set "FOLDER_PATH=D:\Projects\websitehomepage"

if "%FOLDER_PATH%"=="" (
    echo Unknown device: %COMPUTERNAME%
    set /p FOLDER_PATH=Enter full project path manually: 
)

if not exist "%FOLDER_PATH%" (
    echo ERROR: Folder not found: "%FOLDER_PATH%"
    pause
    exit /b
)

cd /d "%FOLDER_PATH%"
echo Working directory: %FOLDER_PATH%
echo.

:: STEP 1: Generate list.json
if exist "generateList.js" (
    echo Running generateList.js...
    call node generateList.js
    if errorlevel 1 (
        echo ERROR: Node.js script failed.
        pause
        exit /b
    )
    echo list.json generated successfully.
) else (
    echo generateList.js not found - skipping.
)
echo.

:: STEP 2: Git push
echo Preparing Git push...
git remote set-url origin https://github.com/Janclydez/CEBoardexam-randomizer.git

git add -A
git diff --cached --exit-code >nul 2>&1
if "%errorlevel%"=="0" (
    echo No changes to commit. Skipping push.
    goto done
)

git commit -m "Frontend update (auto list.json)"
if errorlevel 1 (
    echo Nothing committed or commit failed.
    goto done
)

git push origin main --force
if errorlevel 1 (
    echo ERROR: Git push failed. Check internet or credentials.
    pause
    exit /b
)
echo Git push completed successfully.

:done
echo.
echo =====================================================
echo All tasks completed successfully!
echo =====================================================
pause
