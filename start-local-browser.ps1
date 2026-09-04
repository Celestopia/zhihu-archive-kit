param([switch]$ChooseFolder)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSCommandPath
$Url = "http://127.0.0.1:17892/"

Set-Location -LiteralPath $ProjectRoot

$SettingsDirectory = Join-Path $env:APPDATA "Zhihu Archive Kit"
$SettingsPath = Join-Path $SettingsDirectory "settings.json"
$ArchiveRoot = $null
if (Test-Path -LiteralPath $SettingsPath -PathType Leaf) {
  $Settings = Get-Content -LiteralPath $SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $ArchiveRoot = $Settings.archiveRoot
  if ($ArchiveRoot -isnot [string] -or -not [IO.Path]::IsPathRooted($ArchiveRoot)) {
    throw "settings.json must contain an absolute archiveRoot path."
  }
}
if ($ChooseFolder -or -not $ArchiveRoot -or -not (Test-Path -LiteralPath $ArchiveRoot -PathType Container)) {
  Add-Type -AssemblyName System.Windows.Forms
  $Picker = New-Object System.Windows.Forms.FolderBrowserDialog
  $Picker.Description = "Select the Zhihu archive folder to preview"
  try {
    if ($Picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
    $ArchiveRoot = $Picker.SelectedPath
  } finally {
    $Picker.Dispose()
  }
  New-Item -ItemType Directory -Path $SettingsDirectory -Force | Out-Null
  $SettingsJson = @{ archiveRoot = $ArchiveRoot } | ConvertTo-Json
  [System.IO.File]::WriteAllText($SettingsPath, $SettingsJson, [System.Text.UTF8Encoding]::new($false))
}

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

node src/render/serve-cli.mjs $ArchiveRoot
