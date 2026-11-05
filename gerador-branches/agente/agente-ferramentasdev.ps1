# Agente Ferramentas Dev
# Servidor local (http://localhost:47615) usado pelo Gerador de branches para:
#   - git clone + checkout + push de cada versão
#   - pman install -f nas pastas com bower.json
#   - listar e apagar clones sem pendências (limpeza)
# Só atende sites autorizados pelo usuário e só executa git e pman.

$ErrorActionPreference = 'Stop'
$Porta = 47615
$Versao = '1.0'
$Pasta = Join-Path $env:LOCALAPPDATA 'FerramentasDevAgente'
$ArqOrigens = Join-Path $Pasta 'sites-autorizados.txt'
$ArqLog = Join-Path $Pasta 'agente.log'
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null

# Uma instância só
$mutex = New-Object System.Threading.Mutex($false, 'Local\FerramentasDevAgente')
if (-not $mutex.WaitOne(0)) { exit 0 }

Add-Type -AssemblyName System.Windows.Forms
$RegexJira = '^[A-Z][A-Z0-9]*-\d+$'
$RegexBranch = '^[A-Za-z0-9._/\-]+$'
$Siglas = @('SUP', 'MAS', 'REL', 'DEV')
$Negados = @{}

function Log($msg) {
  try { Add-Content -LiteralPath $ArqLog -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg) -Encoding UTF8 } catch {}
}

# ---------- sites autorizados ----------
function Origens {
  if (Test-Path -LiteralPath $ArqOrigens) { return @(Get-Content -LiteralPath $ArqOrigens -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
  return @()
}
function OrigemValida($o) { return ($o -and $o -match '^https?://[A-Za-z0-9.\-]+(:\d+)?$') }
function Autorizado($o) { return ((OrigemValida $o) -and ((Origens) -contains $o)) }
function PedirAutorizacao($o) {
  if (-not (OrigemValida $o)) { return $false }
  if (Autorizado $o) { return $true }
  $txt = "O site abaixo quer usar o Agente Ferramentas Dev para clonar repositórios, criar branches, rodar o pman e apagar pastas de clone no seu computador:`n`n$o`n`nPermitir este site?"
  $r = [System.Windows.Forms.MessageBox]::Show($txt, 'Agente Ferramentas Dev', 'YesNo', 'Question', 'Button2', 'DefaultDesktopOnly')
  if ($r -eq 'Yes') { Add-Content -LiteralPath $ArqOrigens -Value $o -Encoding UTF8; Log "Site autorizado: $o"; return $true }
  $Negados[$o] = $true
  Log "Site recusado: $o"
  return $false
}

# ---------- execução de comandos ----------
function Citar([string]$s) {
  if ($s -eq '') { return '""' }
  if ($s -match '[\s"]') { return '"' + ($s -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"' }
  return $s
}
function Executar([string]$exe, [string[]]$argumentos, [string]$dir) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = (($argumentos | ForEach-Object { Citar $_ }) -join ' ')
  $psi.WorkingDirectory = $dir
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
  $psi.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
  try {
    $p = [System.Diagnostics.Process]::Start($psi)
  } catch {
    return [pscustomobject]@{ codigo = -1; saida = ''; erro = "Não foi possível executar '$exe': $($_.Exception.Message)"; comando = "$exe $($psi.Arguments)" }
  }
  $o = $p.StandardOutput.ReadToEndAsync()
  $e = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  return [pscustomobject]@{ codigo = $p.ExitCode; saida = $o.Result; erro = $e.Result; comando = "$exe $($psi.Arguments)" }
}
function Git([string[]]$a, [string]$dir) { return Executar 'git.exe' $a $dir }
function Etapa($lista, $nome, $res) {
  $ok = ($res.codigo -eq 0)
  $det = ('> ' + $res.comando + "`n" + (($res.saida + "`n" + $res.erro).Trim()))
  [void]$lista.Add([ordered]@{ etapa = $nome; ok = $ok; detalhe = $det })
  return $ok
}

# ---------- validações ----------
function PastaBaseValida([string]$p) {
  if (-not $p) { throw 'Informe a pasta "Salvar em".' }
  if ($p -notmatch '^[A-Za-z]:\\') { throw "Caminho inválido em 'Salvar em': $p (use um caminho completo, ex.: C:\FontesGit)." }
  if ($p -match '[<>"|?*]' -or $p -match '\\\.\.(\\|$)') { throw "Caminho inválido em 'Salvar em': $p" }
  return [System.IO.Path]::GetFullPath($p).TrimEnd('\')
}

# ---------- /clonar (uma versão por chamada) ----------
function Clonar($b) {
  $jira = [string]$b.jira; $sigla = [string]$b.sigla; $link = [string]$b.link
  $base = [string]$b.branchBase; $branch = [string]$b.branch
  if ($jira -cnotmatch $RegexJira) { throw "Número do Jira inválido: $jira" }
  if ($Siglas -notcontains $sigla) { throw "Versão inválida: $sigla" }
  if ($link -notmatch '^https://[^\s"]+$') { throw "Link de clone inválido: $link" }
  foreach ($x in @($base, $branch)) { if ($x -notmatch $RegexBranch -or $x -match '\.\.') { throw "Nome de branch inválido: $x" } }
  $repo = ($link.TrimEnd('/') -replace '\.git$', '').Split('/')[-1]
  if ($repo -notmatch '^[A-Za-z0-9._\-]+$') { throw "Não consegui identificar o nome da rotina pelo link: $link" }

  $raiz = PastaBaseValida ([string]$b.pastaBase)
  $demanda = Join-Path $raiz $jira
  $pv = Join-Path $demanda $sigla
  $destino = Join-Path $pv $repo
  $etapas = New-Object System.Collections.ArrayList
  $r = [ordered]@{ ok = $false; sigla = $sigla; destino = $destino; etapas = $etapas; faltando = @(); erro = $null }

  if (Test-Path -LiteralPath $destino) {
    $r.erro = 'A pasta já existe, versão pulada.'
    [void]$etapas.Add([ordered]@{ etapa = 'Verificar pasta'; ok = $false; detalhe = "A pasta já existe: $destino" })
    $r.faltando = @()
    return $r
  }
  New-Item -ItemType Directory -Force -Path $pv | Out-Null

  $okClone = Etapa $etapas "git clone ($base)" (Git @('clone', '--branch', $base, $link, $destino) $pv)
  $bowers = @()
  if ($okClone) {
    $okCheckout = Etapa $etapas "Criar branch $branch" (Git @('checkout', '-b', $branch) $destino)
    if ($okCheckout -and $b.push) {
      [void](Etapa $etapas 'git push para o Azure' (Git @('push', '-u', 'origin', $branch) $destino))
    }
    if ($b.pman) {
      $bowers = @(Get-ChildItem -LiteralPath $destino -Recurse -Filter 'bower.json' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\(\.git|bower_components|node_modules)\\' } |
        ForEach-Object { $_.DirectoryName } | Sort-Object -Unique)
      if (-not $bowers.Count) {
        [void]$etapas.Add([ordered]@{ etapa = 'pman install -f'; ok = $true; detalhe = 'Nenhum bower.json encontrado na rotina.' })
      }
      foreach ($d in $bowers) {
        [void](Etapa $etapas "pman install -f ($d)" (Executar 'cmd.exe' @('/d', '/c', 'pman install -f') $d))
      }
    }
  }

  # Validação final: pasta da demanda, pasta da versão, rotina clonada e lib do bower
  $faltando = New-Object System.Collections.ArrayList
  foreach ($p in @($demanda, $pv)) { if (-not (Test-Path -LiteralPath $p -PathType Container)) { [void]$faltando.Add($p) } }
  if (-not (Test-Path -LiteralPath (Join-Path $destino '.git'))) { [void]$faltando.Add($destino) }
  foreach ($d in $bowers) {
    $lib = 'lib'
    $rc = Join-Path $d '.bowerrc'
    if (Test-Path -LiteralPath $rc) {
      try { $j = Get-Content -LiteralPath $rc -Raw -Encoding UTF8 | ConvertFrom-Json; if ($j.directory) { $lib = [string]$j.directory } } catch {}
    }
    $pl = Join-Path $d $lib
    if (-not (Test-Path -LiteralPath $pl -PathType Container)) { [void]$faltando.Add($pl) }
  }
  $r.faltando = @($faltando)
  $falhas = @($etapas | Where-Object { -not $_.ok })
  $r.ok = ($falhas.Count -eq 0 -and $faltando.Count -eq 0)
  if (-not $r.ok) {
    if ($falhas.Count) { $r.erro = 'Falhou: ' + (($falhas | ForEach-Object { $_.etapa }) -join ', ') }
    else { $r.erro = 'Validação: pasta não encontrada' }
  }
  Log "clonar $jira $sigla -> $destino : ok=$($r.ok) $($r.erro)"
  return $r
}

# ---------- limpeza ----------
function InfoClone([string]$dir) {
  $st = Git @('status', '--porcelain') $dir
  $ne = Git @('log', '--branches', '--not', '--remotes', '--oneline') $dir
  $sh = Git @('stash', 'list') $dir
  $br = Git @('rev-parse', '--abbrev-ref', 'HEAD') $dir
  $alt = @(($st.saida -split "`n") | Where-Object { $_.Trim() }).Count
  $nao = @(($ne.saida -split "`n") | Where-Object { $_.Trim() }).Count
  $stash = @(($sh.saida -split "`n") | Where-Object { $_.Trim() }).Count
  $det = @()
  if ($st.codigo -ne 0) { $det += 'não foi possível ler o status do git' }
  if ($alt) { $det += "$alt arquivo(s) alterado(s) sem commit" }
  if ($nao) { $det += "$nao commit(s) não enviado(s)" }
  if ($stash) { $det += "$stash stash(es)" }
  return [ordered]@{ branch = $br.saida.Trim(); alterados = $alt; naoEnviados = $nao; stash = $stash; pendente = [bool]$det.Count; detalhe = ($det -join ', ') }
}
function ListarLimpeza($b) {
  $raiz = PastaBaseValida ([string]$b.pastaBase)
  $itens = New-Object System.Collections.ArrayList
  if (-not (Test-Path -LiteralPath $raiz -PathType Container)) { return [ordered]@{ ok = $true; itens = @() } }
  foreach ($dem in @(Get-ChildItem -LiteralPath $raiz -Directory | Where-Object { $_.Name -cmatch $RegexJira })) {
    foreach ($ver in @(Get-ChildItem -LiteralPath $dem.FullName -Directory)) {
      foreach ($rep in @(Get-ChildItem -LiteralPath $ver.FullName -Directory)) {
        if (-not (Test-Path -LiteralPath (Join-Path $rep.FullName '.git'))) { continue }
        $i = InfoClone $rep.FullName
        $i['caminho'] = $rep.FullName; $i['demanda'] = $dem.Name; $i['versao'] = $ver.Name; $i['repo'] = $rep.Name
        [void]$itens.Add($i)
      }
    }
  }
  return [ordered]@{ ok = $true; itens = @($itens) }
}
function ApagarLimpeza($b) {
  $raiz = PastaBaseValida ([string]$b.pastaBase)
  $res = New-Object System.Collections.ArrayList
  foreach ($c in @($b.caminhos)) {
    $c = [string]$c
    try {
      $full = [System.IO.Path]::GetFullPath($c).TrimEnd('\')
      $ver = Split-Path $full -Parent; $dem = Split-Path $ver -Parent; $base = Split-Path $dem -Parent
      if ($base -ne $raiz -or (Split-Path $dem -Leaf) -cnotmatch $RegexJira) { throw 'Fora da estrutura <Salvar em>\<DEMANDA>\<VERSÃO>\<rotina>.' }
      if (-not (Test-Path -LiteralPath (Join-Path $full '.git'))) { throw 'Não é um clone git.' }
      Get-ChildItem -LiteralPath $full -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $_.IsReadOnly = $false }
      Remove-Item -LiteralPath $full -Recurse -Force
      foreach ($p in @($ver, $dem)) {
        if ((Test-Path -LiteralPath $p) -and -not (Get-ChildItem -LiteralPath $p -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $p -Force }
      }
      Log "apagado $full"
      [void]$res.Add([ordered]@{ caminho = $c; ok = $true })
    } catch {
      [void]$res.Add([ordered]@{ caminho = $c; ok = $false; erro = $_.Exception.Message })
    }
  }
  return [ordered]@{ ok = $true; resultados = @($res) }
}

# ---------- HTTP ----------
function Responder($ctx, [int]$codigo, $obj) {
  $resp = $ctx.Response
  $o = $ctx.Request.Headers['Origin']
  if (OrigemValida $o) { $resp.Headers['Access-Control-Allow-Origin'] = $o; $resp.Headers['Vary'] = 'Origin' }
  $resp.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $resp.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $resp.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $resp.StatusCode = $codigo
  if ($obj -ne $null) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $obj -Depth 8 -Compress))
    $resp.ContentType = 'application/json; charset=utf-8'
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  }
  $resp.Close()
}
function LerCorpo($req) {
  $sr = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
  $t = $sr.ReadToEnd(); $sr.Close()
  if (-not $t.Trim()) { return [pscustomobject]@{} }
  return ($t | ConvertFrom-Json)
}
function VersaoCmd($exe, $a) {
  try { $r = Executar $exe $a $env:USERPROFILE; if ($r.codigo -eq 0) { return (($r.saida + $r.erro).Trim() -split "`n")[0].Trim() } } catch {}
  return $null
}

function Tratar($ctx) {
  $req = $ctx.Request
  $rota = $req.Url.AbsolutePath.TrimEnd('/')
  $o = $req.Headers['Origin']
  if ($req.HttpMethod -eq 'OPTIONS') { Responder $ctx 204 $null; return }

  if ($rota -eq '/status' -and $req.HttpMethod -eq 'GET') {
    $pman = $null
    if (Get-Command pman -ErrorAction SilentlyContinue) { $pman = 'pman' }
    Responder $ctx 200 ([ordered]@{ ok = $true; versao = $Versao; autorizado = (Autorizado $o); git = (VersaoCmd 'git.exe' @('--version')); pman = $pman })
    return
  }
  if ($req.HttpMethod -ne 'POST') { Responder $ctx 404 @{ ok = $false; erro = 'Rota não encontrada.' }; return }

  if ($rota -eq '/autorizar') { Responder $ctx 200 @{ ok = $true; autorizado = (PedirAutorizacao $o) }; return }
  if (-not (Autorizado $o)) { Responder $ctx 403 @{ ok = $false; erro = 'Site não autorizado no agente.' }; return }

  $b = LerCorpo $req
  switch ($rota) {
    '/clonar' { Responder $ctx 200 (Clonar $b) }
    '/limpeza/listar' { Responder $ctx 200 (ListarLimpeza $b) }
    '/limpeza/apagar' { Responder $ctx 200 (ApagarLimpeza $b) }
    default { Responder $ctx 404 @{ ok = $false; erro = 'Rota não encontrada.' } }
  }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Porta/")
try { $listener.Start() } catch {
  Log "Não foi possível abrir a porta $Porta : $($_.Exception.Message)"
  [System.Windows.Forms.MessageBox]::Show("Não foi possível iniciar o agente na porta $Porta.`n$($_.Exception.Message)", 'Agente Ferramentas Dev', 'OK', 'Error') | Out-Null
  exit 1
}
Log "Agente iniciado na porta $Porta"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try { Tratar $ctx }
  catch {
    Log "Erro: $($_.Exception.Message)"
    try { Responder $ctx 400 @{ ok = $false; erro = $_.Exception.Message } } catch {}
  }
}
