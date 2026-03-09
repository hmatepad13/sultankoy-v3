param(
  [string]$Timestamp = (Get-Date -Format "yyyyMMdd-HHmmss")
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root "backups"
$desktop = [Environment]::GetFolderPath("Desktop")

$fullTemp = Join-Path $desktop "sultankoy-v3-tam-yedek-$Timestamp.zip"
$sourceTemp = Join-Path $desktop "sultankoy-v3-kaynak-yedek-$Timestamp.zip"
$fullTarget = Join-Path $backupDir "sultankoy-v3-tam-yedek-$Timestamp.zip"
$sourceTarget = Join-Path $backupDir "sultankoy-v3-kaynak-yedek-$Timestamp.zip"

Remove-Item $fullTemp, $sourceTemp, $fullTarget, $sourceTarget -Force -ErrorAction SilentlyContinue

$fullItems = Get-ChildItem -LiteralPath $root -Force | ForEach-Object FullName
Compress-Archive -Path $fullItems -DestinationPath $fullTemp -CompressionLevel Optimal -Force
Move-Item -Force $fullTemp $fullTarget

$exclude = @(".git", "node_modules", "dist", "backups", ".codex-debug", "temp-image-tests")
$sourceItems = Get-ChildItem -LiteralPath $root -Force |
  Where-Object { $exclude -notcontains $_.Name } |
  ForEach-Object FullName

Compress-Archive -Path $sourceItems -DestinationPath $sourceTemp -CompressionLevel Optimal -Force
Move-Item -Force $sourceTemp $sourceTarget

Get-ChildItem -LiteralPath $backupDir |
  Where-Object { $_.Name -like "*$Timestamp*" } |
  Select-Object Name, Length, LastWriteTime
