$ErrorActionPreference = "Stop"

$BridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = if ($env:SAGRA_BRIDGE_PORT) { [int]$env:SAGRA_BRIDGE_PORT } else { 8787 }
$LogDir = Join-Path $env:LOCALAPPDATA "SagraMisterPOSBridge\Logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Fail($Message) {
  Write-Host "ERRORE: $Message" -ForegroundColor Red
  if ($Host.Name -eq "ConsoleHost") {
    Write-Host ""
    Read-Host "Premi Invio per chiudere questa finestra"
  }
  exit 1
}

function Get-JavaMajor($JavaExe) {
  $versionText = & $JavaExe -version 2>&1 | Out-String
  if ($versionText -match 'version "([^"]+)"') {
    $parts = $Matches[1].Split(".")
    if ($parts[0] -eq "1") { return [int]$parts[1] }
    return [int]$parts[0]
  }
  return 0
}

function Test-JavaAttach($JavaExe) {
  try {
    $modules = & $JavaExe --list-modules 2>$null
    return ($modules -match '^jdk\.attach@?')
  } catch {
    return $false
  }
}

function Find-Java {
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($env:SAGRA_JAVA) { $candidates.Add($env:SAGRA_JAVA) }
  if ($env:JAVA_HOME) { $candidates.Add((Join-Path $env:JAVA_HOME "bin\java.exe")) }

  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)})
  foreach ($root in $roots) {
    if (-not $root) { continue }
    foreach ($pattern in @("Eclipse Adoptium\jdk-*", "Java\jdk-*", "Microsoft\jdk-*", "Zulu\zulu-*")) {
      Get-ChildItem -Path (Join-Path $root $pattern) -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { $candidates.Add((Join-Path $_.FullName "bin\java.exe")) }
    }
  }

  $pathJava = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($pathJava) { $candidates.Add($pathJava.Source) }

  foreach ($java in ($candidates | Select-Object -Unique)) {
    if (-not (Test-Path $java)) { continue }
    $major = Get-JavaMajor $java
    if ($major -ge 11 -and (Test-JavaAttach $java)) {
      return $java
    }
  }
  return $null
}

function Find-MisterPosDir {
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($env:MISTERPOS_DIR) { $candidates.Add($env:MISTERPOS_DIR) }

  foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, "C:\")) {
    if (-not $root) { continue }
    foreach ($dir in Get-ChildItem -Path $root -Directory -Filter "MisterPOS*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending) {
      $candidates.Add($dir.FullName)
    }
  }

  foreach ($dir in ($candidates | Select-Object -Unique)) {
    if (Test-Path (Join-Path $dir "misterpos.jar")) {
      return $dir
    }
  }
  return $null
}

function Find-MisterPosPid {
  $processes = Get-CimInstance Win32_Process -Filter "name = 'java.exe' OR name = 'javaw.exe'" -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    if ($process.CommandLine -and $process.CommandLine -match '(?i)misterpos(\.Run|\.jar)|MisterPOS') {
      return $process.ProcessId
    }
  }
  return $null
}

function Wait-MisterPosPid {
  for ($i = 0; $i -lt 30; $i++) {
    $foundPid = Find-MisterPosPid
    if ($foundPid) { return $foundPid }
    Start-Sleep -Seconds 1
  }
  return $null
}

function Start-MisterPos($Java, $MisterPosDir) {
  $jar = Join-Path $MisterPosDir "misterpos.jar"
  $logging = Join-Path $MisterPosDir "logging.properties"
  $activationCandidates = @(
    (Join-Path $env:APPDATA "MisterPOS-2.5\javax.activation-1.2.0.jar"),
    (Join-Path $env:LOCALAPPDATA "MisterPOS-2.5\javax.activation-1.2.0.jar")
  )
  $activation = $activationCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  $out = Join-Path $LogDir "misterpos.out.log"
  $err = Join-Path $LogDir "misterpos.err.log"

  Write-Host "Avvio MisterPOS..."
  if ($activation) {
    $cp = "$activation;$jar"
    Start-Process -FilePath $Java -ArgumentList @("-Djava.util.logging.config.file=$logging", "-cp", $cp, "misterpos.Run", "-lang", "it", "-user", "admin", "-nofull") -RedirectStandardOutput $out -RedirectStandardError $err
  } else {
    Start-Process -FilePath $Java -ArgumentList @("-Djava.util.logging.config.file=$logging", "-jar", $jar, "-lang", "it", "-user", "admin", "-nofull") -RedirectStandardOutput $out -RedirectStandardError $err
  }
}

function Test-BridgeHealth {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5 -UseBasicParsing
    return ($response.Content -match '"ok"\s*:\s*true')
  } catch {
    return $false
  }
}

if (-not (Test-Path (Join-Path $BridgeDir "sagra-misterpos-agent.jar"))) {
  Fail "Manca sagra-misterpos-agent.jar in $BridgeDir"
}
if (-not (Test-Path (Join-Path $BridgeDir "sagra-agent-attacher.jar"))) {
  Fail "Manca sagra-agent-attacher.jar in $BridgeDir"
}

$Java = Find-Java
if (-not $Java) {
  Fail "Installa un JDK Java 11 o superiore. Deve includere il modulo jdk.attach."
}

$MisterPosDir = Find-MisterPosDir
if (-not $MisterPosDir) {
  Fail "Non trovo MisterPOS. Imposta MISTERPOS_DIR alla cartella che contiene misterpos.jar."
}

Write-Host "Java: $Java"
Write-Host "MisterPOS: $MisterPosDir"
Write-Host "Bridge: http://127.0.0.1:$Port"

$MisterPosPid = Find-MisterPosPid
if (-not $MisterPosPid) {
  Start-MisterPos $Java $MisterPosDir
  $MisterPosPid = Wait-MisterPosPid
}
if (-not $MisterPosPid) {
  Fail "MisterPOS non si e' avviato. Controlla i log in $LogDir"
}

Write-Host "Processo MisterPOS: $MisterPosPid"

if (-not (Test-BridgeHealth)) {
  Write-Host "Collego il bridge a MisterPOS..."
  $attachLog = Join-Path $LogDir "attach.log"
  $agentJar = Join-Path $BridgeDir "sagra-misterpos-agent.jar"
  $attacherJar = Join-Path $BridgeDir "sagra-agent-attacher.jar"
  & $Java "--add-modules" "jdk.attach" "-jar" $attacherJar "$MisterPosPid" $agentJar "port=$Port" *> $attachLog
  if ($LASTEXITCODE -ne 0) {
    Get-Content $attachLog -ErrorAction SilentlyContinue
    Fail "Attach fallito. Avvia questo collegamento con lo stesso utente di MisterPOS e verifica che sia installato un JDK, non solo un JRE."
  }
}

if (Test-BridgeHealth) {
  Write-Host "OK: bridge pronto." -ForegroundColor Green
  Write-Host "Dalla cassa usa l'IP LAN di questo PC e la porta $Port."
  Write-Host "Log: $LogDir"
  if ($Host.Name -eq "ConsoleHost") {
    Write-Host ""
    Read-Host "Premi Invio per chiudere questa finestra"
  }
  exit 0
}

Fail "Bridge non raggiungibile su 127.0.0.1:$Port. Controlla firewall Windows, porta occupata o log in $LogDir."
