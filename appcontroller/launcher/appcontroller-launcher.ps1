# Recebe uma URL appcontroller:?exe=...&h=...&u=...&p=... e abre o AppController.exe
param([string]$Url)
Add-Type -AssemblyName System.Windows.Forms
function Falha($msg) { [System.Windows.Forms.MessageBox]::Show($msg, 'AppController Launcher', 'OK', 'Error') | Out-Null; exit 1 }

$q = $Url -replace '^appcontroller:/*\??', ''
$p = @{}
foreach ($par in $q -split '&') {
  $kv = $par -split '=', 2
  if ($kv.Count -eq 2) { $p[$kv[0]] = [System.Uri]::UnescapeDataString($kv[1].Replace('+', '%20')) }
}
foreach ($k in 'exe','h','u','p') { if (-not $p[$k]) { Falha "Parâmetro '$k' ausente." } }

# Segurança: só executa um arquivo chamado AppController.exe que exista no disco
$exe = $p['exe'].Trim('"')
if ((Split-Path $exe -Leaf) -ne 'AppController.exe') { Falha "Somente AppController.exe pode ser executado.`n$exe" }
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { Falha "Arquivo não encontrado:`n$exe" }

function Q($s) { if ($s -match '[\s"]') { '"' + ($s -replace '"', '\"') + '"' } else { $s } }
$argumentos = "-h $(Q $p['h']) -u $(Q $p['u']) -p $(Q $p['p'])"
Start-Process -FilePath $exe -ArgumentList $argumentos
