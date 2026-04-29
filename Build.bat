@echo off
title Soundboard - Build
cd /d "%~dp0"

echo.
echo ============================================================
echo  Soundboard Build
echo ============================================================
echo.
echo  Dies erstellt zwei Dateien im Unterordner "dist":
echo.
echo    1. Soundboard-1.0.0-portable.exe
echo       (Single-File, keine Installation - einfach starten)
echo.
echo    2. Soundboard-1.0.0-x64-setup.exe
echo       (Installer mit Startmenue-Eintrag und Verknuepfung)
echo.
echo  Der erste Build dauert ein paar Minuten - Electron wird
echo  heruntergeladen und gepackt.
echo.
echo ============================================================
pause

REM Pruefen ob node_modules vorhanden
if not exist "node_modules" (
    echo.
    echo Installiere Dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install fehlgeschlagen.
        pause
        exit /b 1
    )
)

REM Sicherstellen dass das Icon vorhanden ist
if not exist "soundboard.ico" (
    echo.
    echo Fehler: soundboard.ico nicht gefunden.
    echo Diese Datei muss im selben Ordner liegen.
    pause
    exit /b 1
)

REM Build starten
echo.
echo Baue Portable und Installer...
echo.
call npm run build:portable
if errorlevel 1 (
    echo.
    echo Build fehlgeschlagen - siehe Fehler oben.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Fertig! Schau in den Ordner "dist".
echo ============================================================
echo.

REM Den dist-Ordner direkt im Explorer oeffnen
if exist "dist" start "" "dist"
pause
