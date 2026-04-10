@echo off
echo Starting NovaKart Backend API and React App...

:: Start the Python backend in a new command window
start "NovaKart Backend" cmd /k "python run.py"

:: Start the React frontend in another new command window
start "NovaKart Frontend" cmd /k "cd demo-app && npm install && npm run dev"

echo Both servers are starting up! Please check the new terminal windows that opened.
