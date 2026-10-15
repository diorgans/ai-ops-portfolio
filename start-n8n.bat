@echo off
title n8n - leave this window open
echo.
echo  ============================================================
echo   Starting n8n
echo.
echo   First start takes about a minute. When you see a line
echo   saying "Editor is now accessible via" the server is up.
echo.
echo   Then open:   http://localhost:5678
echo.
echo   LEAVE THIS WINDOW OPEN while you work. Closing it, or
echo   pressing Ctrl+C, stops n8n. Your workflows are saved in
echo   C:\Users\%USERNAME%\.n8n and survive a restart.
echo  ============================================================
echo.

n8n start

echo.
echo  n8n has stopped. Press any key to close this window.
pause >nul
