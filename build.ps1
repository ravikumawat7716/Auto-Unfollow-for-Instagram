# Packs only the Chrome extension files into dist\ig-unfollow-helper-<version>.zip,
# ready to upload to the Chrome Web Store. The Playwright bot, your keep list,
# settings.json, data\ and Excel reports are left out.
# Zip entries use forward slashes (Compress-Archive in Windows PowerShell 5.1 writes
# backslashes, which the Web Store can reject).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$items = @('manifest.json', 'popup.html', 'popup.js', 'icons', 'src', 'lib')

New-Item -ItemType Directory -Force dist | Out-Null
$zipPath = Join-Path $PSScriptRoot "dist\ig-unfollow-helper-$version.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($item in $items) {
    foreach ($file in Get-ChildItem $item -Recurse -File) {
      $name = $file.FullName.Substring($PSScriptRoot.Length + 1).Replace('\', '/')
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $name)
    }
  }
} finally {
  $zip.Dispose()
}
Write-Host "Built dist\ig-unfollow-helper-$version.zip"
