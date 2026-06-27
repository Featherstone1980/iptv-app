@echo off
cd "c:\Users\Shane\Desktop\Snarky Moose 2026\IPTV app\apps\web-pc"
start cmd /k "npm run start"
timeout /t 3 /nobreak >nul
npm run start:desktop
