@echo off
reg delete "HKCU\Software\Classes\appcontroller" /f >nul 2>&1
rmdir /s /q "%LOCALAPPDATA%\AppControllerLauncher" 2>nul
echo Launcher removido.
pause
