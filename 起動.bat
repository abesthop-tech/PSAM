@echo off
cd /d "%~dp0"
start "PSAM Backend" cmd /k "cd backend && venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
start "PSAM Frontend" cmd /k "cd frontend && npm run dev"
timeout /t 4 >nul
start "" "http://localhost:5173"
