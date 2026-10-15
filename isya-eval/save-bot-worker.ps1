# Saves the deployed bot worker from the clipboard to disk.
#
# USAGE
#   1. Cloudflare -> your bot worker -> Edit code -> click in the editor
#      -> Ctrl+A, Ctrl+C
#   2. Double-click this file, or right-click -> Run with PowerShell.
#      Do NOT copy anything else in between - the clipboard must still hold
#      the worker source.
#
# It validates before writing, so a wrong clipboard cannot destroy the file.

$dest = Join-Path $PSScriptRoot 'discord-bot\bot-worker.js'
$clip = Get-Clipboard -Raw

Write-Host ""
if ([string]::IsNullOrWhiteSpace($clip)) {
    Write-Host "Clipboard is empty. Nothing written." -ForegroundColor Red
    Read-Host "Press Enter to close"; exit 1
}

# Sanity checks: this must look like the deployed bot worker.
$len      = $clip.Length
$hasVerify = $clip -match 'verifyDiscordRequest'
$hasExport = $clip -match 'export default'
$hasGrade  = $clip -match 'processGrade'
$bigEnough = $len -gt 20000

Write-Host ("clipboard length : {0:N0} chars" -f $len)
Write-Host ("looks like a worker (export default) : {0}" -f $hasExport)
Write-Host ("has verifyDiscordRequest             : {0}" -f $hasVerify)
Write-Host ("has processGrade                     : {0}" -f $hasGrade)
Write-Host ("large enough (>20,000 chars)          : {0}" -f $bigEnough)
Write-Host ""

if (-not ($hasVerify -and $hasExport -and $hasGrade -and $bigEnough)) {
    Write-Host "This does NOT look like the bot worker. Nothing written." -ForegroundColor Red
    Write-Host "Re-copy from the Cloudflare editor (Ctrl+A, Ctrl+C) and run this again."
    Read-Host "Press Enter to close"; exit 1
}

# Keep a timestamped backup of whatever is there now, just in case.
if (Test-Path $dest) {
    $bak = "$dest.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item $dest $bak
    Write-Host "previous file backed up to: $bak"
}

Set-Content -Path $dest -Value $clip -Encoding utf8
$lines = (Get-Content $dest | Measure-Object -Line).Lines
Write-Host ""
Write-Host ("SAVED: {0}" -f $dest) -ForegroundColor Green
Write-Host ("lines: {0}" -f $lines)
Read-Host "Press Enter to close"
