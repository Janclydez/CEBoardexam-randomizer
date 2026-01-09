@echo off
cd /d "%~dp0"
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File ".\replace_header_and_bottom.ps1"
pause
