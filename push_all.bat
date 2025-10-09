@echo off
title CE Board Exam Generator – Push Frontend & Backend
echo =====================================================
echo     CE BOARD EXAM GENERATOR – AUTO DEPLOY SCRIPT
echo =====================================================
echo.

:: ===========================================================
:: STEP 1: Generate list.json before pushing frontend
:: ===========================================================
echo 🔄 Generating updated list.json for frontend...
cd /d "C:\Users\Clide\Downloads\websitehomepage"

if exist "generateList.js" (
    node generateList.js
    if %errorlevel% neq 0 (
        echo ❌ Error generating list.json. Check Node.js installation or script errors.
        pause
        exit /b
    )
    echo ✅ list.json generated successfully.
) else (
    echo ⚠️ generateList.js not found — skipping list update.
)
echo.

:: ===========================================================
:: STEP 2: Push FRONTEND to GitHub
:: ===========================================================
echo 🚀 Pushing FRONTEND...
git remote set-url origin https://github.com/Janclydez/CEBoardexam-randomizer.git
git add .
git commit -m "Frontend update (auto list.json)"
git push origin main --force
if %errorlevel% neq 0 (
    echo ❌ Frontend push failed. Check your connection or credentials.
    pause
    exit /b
)
echo ✅ Frontend pushed successfully!
echo ---------------------------------------

:: ===========================================================
:: STEP 3: Push BACKEND to GitHub
:: ===========================================================
echo 🚀 Pushing BACKEND...
cd /d "C:\Users\Clide\Downloads\backend-folder-name"
git remote set-url origin https://github.com/Janclydez/ce-exam-generator.git
git add .
git commit -m "Backend update"
git push origin main
if %errorlevel% neq 0 (
    echo ❌ Backend push failed. Check your connection or credentials.
    pause
    exit /b
)
echo ✅ Backend pushed successfully!
echo ---------------------------------------

echo ✅✅ All tasks completed! Frontend (with list.json) and Backend pushed.
echo =====================================================
pause
