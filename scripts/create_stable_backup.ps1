param(
  [string]$Timestamp
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Timestamp)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
}

$root = "C:\Users\BattleStar\Desktop\site kod\sultankoy-v3"
$backupDir = Join-Path $root "backups"
$sourceZip = Join-Path $backupDir ("sultankoy-v3-kaynak-yedek-" + $Timestamp + ".zip")
$fullZip = Join-Path $backupDir ("sultankoy-v3-tam-yedek-" + $Timestamp + ".zip")
$tempRoot = Join-Path $env:TEMP ("sultankoy-v3-backup-" + $Timestamp)
$sourceTemp = Join-Path $tempRoot "source"
$fullTemp = Join-Path $tempRoot "full"

New-Item -ItemType Directory -Path $sourceTemp -Force | Out-Null
New-Item -ItemType Directory -Path $fullTemp -Force | Out-Null

robocopy $root $sourceTemp /MIR /XD node_modules dist .git backups scripts /XF vite-dev.log > $null
robocopy $root $fullTemp /MIR /XD .git backups /XF vite-dev.log > $null

if (Test-Path $sourceZip) {
  Remove-Item $sourceZip -Force
}
if (Test-Path $fullZip) {
  Remove-Item $fullZip -Force
}

Compress-Archive -Path (Join-Path $sourceTemp "*") -DestinationPath $sourceZip -CompressionLevel Optimal
Compress-Archive -Path (Join-Path $fullTemp "*") -DestinationPath $fullZip -CompressionLevel Optimal

Remove-Item $tempRoot -Recurse -Force

Get-Item $sourceZip, $fullZip | Select-Object Name, Length, LastWriteTime
