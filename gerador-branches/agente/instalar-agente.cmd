@echo off
setlocal
REM Instala o Agente Ferramentas Dev para o usuario atual (nao precisa de administrador)
set "DEST=%LOCALAPPDATA%\FerramentasDevAgente"
set "PS1=%DEST%\agente-ferramentasdev.ps1"
if not exist "%~dp0agente-ferramentasdev.ps1" (
  echo Coloque o arquivo agente-ferramentasdev.ps1 na mesma pasta deste instalador.
  pause & exit /b 1
)
call :parar
mkdir "%DEST%" 2>nul
copy /Y "%~dp0agente-ferramentasdev.ps1" "%PS1%" >nul

set "CMDLINE=powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%PS1%\""
REM Inicia junto com o Windows
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "FerramentasDevAgente" /d "%CMDLINE%" /f >nul
REM Protocolo ferramentasdev-agente: (botao "Iniciar agente" do site)
reg add "HKCU\Software\Classes\ferramentasdev-agente" /ve /d "URL:Agente Ferramentas Dev" /f >nul
reg add "HKCU\Software\Classes\ferramentasdev-agente" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\ferramentasdev-agente\shell\open\command" /ve /d "%CMDLINE%" /f >nul

start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PS1%"
echo.
echo Agente instalado em %DEST% e em execucao (porta 47615).
echo Ele inicia sozinho com o Windows. Volte ao site e clique em "Verificar de novo".
pause
exit /b 0

:parar
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*agente-ferramentasdev.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
exit /b 0
