# Builds data/bundle.js from data/people.json and i18n/*.json.
# The bundle lets the site open by double-clicking index.html.
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Json($relative) {
    $path = Join-Path $root $relative
    $text = [IO.File]::ReadAllText($path, $utf8)
    try { $null = $text | ConvertFrom-Json }
    catch { throw "JSON error in ${relative}: $($_.Exception.Message)" }
    return $text
}

$i18n = @('ru', 'uk', 'en', 'de') | ForEach-Object { '"' + $_ + '":' + (Read-Json "i18n\$_.json") }
$js = 'window.SITE_BUNDLE={"data":' + (Read-Json 'data\people.json') + ',"i18n":{' + ($i18n -join ',') + '}};'
[IO.File]::WriteAllText((Join-Path $root 'data\bundle.js'), $js, $utf8)
Write-Host 'OK: data/bundle.js updated.'
