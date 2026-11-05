@echo off
setlocal
REM Instala o protocolo appcontroller: para o usuario atual (nao precisa de administrador)
set "DEST=%LOCALAPPDATA%\AppControllerLauncher"
if not exist "%~dp0appcontroller-launcher.ps1" (
  echo Coloque o arquivo appcontroller-launcher.ps1 na mesma pasta deste instalador.
  pause & exit /b 1
)
mkdir "%DEST%" 2>nul
copy /Y "%~dp0appcontroller-launcher.ps1" "%DEST%\appcontroller-launcher.ps1" >nul

reg add "HKCU\Software\Classes\appcontroller" /ve /d "URL:AppController Launcher" /f >nul
reg add "HKCU\Software\Classes\appcontroller" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\appcontroller\shell\open\command" /ve /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%DEST%\appcontroller-launcher.ps1\" \"%%1\"" /f >nul

echo Launcher instalado em %DEST%
echo Agora o botao "Executar (CMD)" do site abre o AppController.
pause
