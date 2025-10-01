@echo off
echo Starting Unified Aura Vision Assistant...
echo.

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Error installing dependencies
    pause
    exit /b 1
)

echo.
echo Starting the unified Node.js application...
echo.
echo NOTE: Make sure to set your environment variables:
echo - GOOGLE_AI_API_KEY (for Gemini AI)
echo - GOOGLE_CLOUD_API_KEY (for Text-to-Speech)
echo.

start "Aura Vision Unified" cmd /k "npm start"

echo.
echo Unified Aura Vision Assistant is starting...
echo.
echo Access at: http://localhost:3000
echo API Health: http://localhost:3000/api/health
echo.
echo Features:
echo - Interactive network background that responds to mouse
echo - Single Node.js server (no Python needed)
echo - AI image analysis with Google Gemini
echo - Voice responses with Google Cloud TTS
echo - Professional glassmorphism UI
echo.
pause 