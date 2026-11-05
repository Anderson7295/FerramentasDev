@echo off
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*agente-ferramentasdev.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "FerramentasDevAgente" /f >nul 2>&1
reg delete "HKCU\Software\Classes\ferramentasdev-agente" /f >nul 2>&1
rmdir /s /q "%LOCALAPPDATA%\FerramentasDevAgente" 2>nul
echo Agente removido.
pause
