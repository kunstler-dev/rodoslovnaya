# Builds data/bundle.js from data/people.json and i18n/*.json.
# The bundle lets the site open by double-clicking index.html.
# It also stamps a fresh version (?v=...) onto every local CSS/JS link in
# index.html, so browsers never keep an old copy of the site in cache.
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

$langs = @('ru', 'uk', 'en', 'de')
$i18n = $langs | ForEach-Object { '"' + $_ + '":' + (Read-Json "i18n\$_.json") }
$people = Read-Json 'data\people.json'

# Version = short hash of the content of all site files (code, data, texts, images).
# The same content always gives the same version; any change gives a new one.
$list = New-Object System.Collections.Generic.List[string]
foreach ($dir in @('css', 'js', 'i18n', 'docs', 'fonts')) {
    $full = Join-Path $root $dir
    if (Test-Path $full) {
        Get-ChildItem -Path $full -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
            $list.Add($rel + ':' + (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash)
        }
    }
}
$list.Add('data/people.json:' + (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root 'data\people.json')).Hash)
$sorted = [string[]]$list.ToArray()
[Array]::Sort($sorted, [StringComparer]::Ordinal)
$sha = [Security.Cryptography.SHA256]::Create()
$digest = $sha.ComputeHash($utf8.GetBytes($sorted -join "`n"))
$version = (-join ($digest | ForEach-Object { $_.ToString('x2') })).Substring(0, 10)

$js = 'window.APP_VERSION="' + $version + '";window.SITE_BUNDLE={"data":' + $people + ',"i18n":{' + ($i18n -join ',') + '}};'
[IO.File]::WriteAllText((Join-Path $root 'data\bundle.js'), $js, $utf8)
Write-Host 'OK: data/bundle.js updated.'

# Stamp the version onto index.html.
$indexPath = Join-Path $root 'index.html'
$html = [IO.File]::ReadAllText($indexPath, $utf8)
$assetRe = New-Object System.Text.RegularExpressions.Regex('((?:src|href)=")((?:css|js|data)/[^"?#]+)(?:\?v=[^"]*)?"')
$html = $assetRe.Replace($html, { param($m) $m.Groups[1].Value + $m.Groups[2].Value + '?v=' + $version + '"' })
$metaRe = New-Object System.Text.RegularExpressions.Regex('<meta name="app-version" content="[^"]*">')
if ($metaRe.IsMatch($html)) {
    $html = $metaRe.Replace($html, '<meta name="app-version" content="' + $version + '">', 1)
} else {
    $html = $html.Replace('<meta charset="utf-8">', '<meta charset="utf-8">' + "`n" + '<meta name="app-version" content="' + $version + '">')
}
[IO.File]::WriteAllText($indexPath, $html, $utf8)
Write-Host ('OK: index.html version ' + $version + '.')
