@echo off
echo Pushing FRONTEND...
cd /d "C:\Users\Clide\Downloads\websitehomepage"
git remote set-url origin https://github.com/Janclydez/CEBoardexam-randomizer.git
git add .
git commit -m "Frontend update"
git push origin main

echo ---------------------------------------
echo Pushing BACKEND...
cd /d "C:\Users\Clide\Downloads\backend-folder-name"
git remote set-url origin https://github.com/Janclydez/ce-exam-generator.git
git add .
git commit -m "Backend update"
git push origin main

pause
