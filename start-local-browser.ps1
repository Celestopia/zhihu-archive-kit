$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSCommandPath
$Url = "http://127.0.0.1:17892/"

Set-Location -LiteralPath $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found. Please install Node.js 20 or later, then run this shortcut again."
  Read-Host "Press Enter to close"
  exit 1
}

$OpenWhenReady = @"
`$url = "$Url"
for (`$i = 0; `$i -lt 80; `$i += 1) {
  try {
    `$response = Invoke-WebRequest -Uri `$url -UseBasicParsing -TimeoutSec 1
    if (`$response.StatusCode -ge 200 -and `$response.StatusCode -lt 500) {
      Start-Process `$url
      exit 0
    }
  } catch {
  }
  Start-Sleep -Milliseconds 250
}
Start-Process `$url
"@
$EncodedOpenWhenReady = [Convert]::ToBase64String(
  [Text.Encoding]::Unicode.GetBytes($OpenWhenReady)
)

Start-Process `
  -FilePath "powershell.exe" `
  -WindowStyle Hidden `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $EncodedOpenWhenReady)

Write-Host "Starting Zhihu Archive Kit local browser service..."
Write-Host "The browser will open $Url after the service is ready."
Write-Host "Press Ctrl+C in this window to stop the service."

node src/render/serve-cli.mjs
