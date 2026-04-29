@echo off
title Soundboard Launcher
cd /d "%~dp0"

REM ---- Pruefen ob Node.js / npm vorhanden ist ----
where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo Fehler: Node.js wurde nicht gefunden.
    echo Bitte Node.js von https://nodejs.org/ installieren und neu versuchen.
    echo.
    pause
    exit /b 1
)

REM ---- Erstinstallation: nur beim ersten Start ----
if not exist "node_modules" (
    echo.
    echo Erste Einrichtung - installiere Dependencies...
    echo Das dauert ein paar Minuten und passiert nur einmal.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo Installation fehlgeschlagen - siehe Fehler oben.
        pause
        exit /b 1
    )
    echo.
    echo Fertig. Starte App...
    timeout /t 2 /nobreak >nul
)

REM ---- App in minimiertem Fenster starten, Launcher schliessen ----
start /MIN "Soundboard" cmd /c "npm start"
exit
