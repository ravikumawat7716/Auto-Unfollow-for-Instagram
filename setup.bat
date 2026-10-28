@echo off
title IG Unfollow Bot setup
cd /d "%~dp0"
echo Installing what the bot needs (Playwright and openpyxl)...
python -m pip install --upgrade -r requirements.txt
if errorlevel 1 (
  echo.
  echo The install failed. Make sure Python 3.9 or newer is installed from python.org
  echo and that "Add python.exe to PATH" was ticked during install.
  pause
  exit /b 1
)
echo.
echo Setup done. Next, double-click scan.bat
pause
