@echo off
echo Pushing FRONTEND...
cd /d C:\Users\clide\Downloads\websitehomepage\frontend
git add .
git commit -m "Frontend update"
git push origin main

echo ---------------------------------
echo Pushing BACKEND...
cd /d C:\Users\clide\Downloads\websitehomepage\backend
git add .
git commit -m "Backend update"
git push origin main

pause