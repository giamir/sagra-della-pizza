$ErrorActionPreference = "Stop"

$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = Join-Path $env:LOCALAPPDATA "SagraMisterPOSBridge"
$Desktop = [Environment]::GetFolderPath("Desktop")
$DesktopLauncher = Join-Path $Desktop "MisterPOS Sagra.cmd"

if (Test-Path "$TargetDir.tmp") {
  Remove-Item "$TargetDir.tmp" -Recurse -Force
}
New-Item -ItemType Directory -Force -Path "$TargetDir.tmp" | Out-Null
Copy-Item -Path (Join-Path $SourceDir "*") -Destination "$TargetDir.tmp" -Recurse -Force

if (Test-Path $TargetDir) {
  Remove-Item $TargetDir -Recurse -Force
}
Move-Item "$TargetDir.tmp" $TargetDir

Set-Content -Path $DesktopLauncher -Encoding ASCII -Value @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\SagraMisterPOSBridge\start-misterpos-sagra.ps1"
if errorlevel 1 pause
"@

Write-Host "Installato in: $TargetDir"
Write-Host "Creato collegamento: $DesktopLauncher"
Write-Host "Apri 'MisterPOS Sagra.cmd' dal Desktop per avviare MisterPOS con il bridge."
Write-Host ""
Read-Host "Premi Invio per chiudere questa finestra"
