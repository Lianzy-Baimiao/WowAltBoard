<# Build the optional native frame. The pinned NuGet SDK stays outside the repo.
   End users need only the Evergreen Runtime, never the SDK. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$version = '1.0.2903.40'
$cache = Join-Path $env:LOCALAPPDATA "WowAltBoard-build\webview2-$version"
$out = Join-Path $PSScriptRoot 'desktop'
New-Item -ItemType Directory -Path $cache, $out -Force | Out-Null
$zip = Join-Path $cache 'sdk.zip'
if (!(Test-Path -LiteralPath $zip)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $zip -UseBasicParsing
}
if (!(Test-Path -LiteralPath (Join-Path $cache 'lib'))) { Expand-Archive -LiteralPath $zip -DestinationPath $cache }
foreach ($dll in @('Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll')) {
    Copy-Item -LiteralPath (Join-Path $cache "lib\net462\$dll") -Destination $out -Force
}
foreach ($arch in @('x86', 'x64', 'arm64')) {
    $dest = Join-Path $out $arch
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $cache "runtimes\win-$arch\native\WebView2Loader.dll") -Destination $dest -Force
}
foreach ($file in @('LICENSE.txt', 'NOTICE.txt')) {
    Copy-Item -LiteralPath (Join-Path $cache $file) -Destination (Join-Path $out "WebView2-$file") -Force
}
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$refs = @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll',
    (Join-Path $out 'Microsoft.Web.WebView2.Core.dll'), (Join-Path $out 'Microsoft.Web.WebView2.WinForms.dll'))
$arguments = @('/nologo', '/target:winexe', '/platform:anycpu', '/utf8output',
    "/out:$out\WowAltBoard.Desktop.exe", "/win32icon:$PSScriptRoot\launcher.ico")
foreach ($ref in $refs) { $arguments += "/reference:$ref" }
& $csc @arguments (Join-Path $PSScriptRoot 'desktop-host.cs')
if ($LASTEXITCODE -ne 0) { throw 'Desktop host compilation failed' }
Write-Host "  Desktop host built: $out" -ForegroundColor Green
