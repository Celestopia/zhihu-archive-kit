$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSCommandPath
$LauncherPath = Join-Path $ProjectRoot "start-local-browser.ps1"
$IconPath = Join-Path $ProjectRoot "assets\zhihu-archive-kit.ico"
$ShortcutPath = Join-Path $ProjectRoot "Zhihu Archive Kit.lnk"
$PowerShellPath = (Get-Process -Id $PID).Path

foreach ($RequiredPath in @($LauncherPath, $IconPath, $PowerShellPath)) {
  if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
    throw "Required file was not found: $RequiredPath"
  }
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $PowerShellPath
$Shortcut.Arguments = "-NoProfile -STA -ExecutionPolicy Bypass -File `"$LauncherPath`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = "$IconPath,0"
$Shortcut.Description = "Start the Zhihu Archive Kit local browser service"
$Shortcut.Save()

Write-Host "Shortcut written to $ShortcutPath"
