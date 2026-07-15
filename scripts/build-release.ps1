param(
    [Parameter(Mandatory = $true)]
    [string]$StreamerBotPath,
    [string]$Version = "0.1.0",
    [string]$DotNetPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$localDotnet = Join-Path $root ".local\dotnet-sdk\dotnet.exe"
$dotnet = if ($DotNetPath) { $DotNetPath } elseif (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { "dotnet" }
$solution = Join-Path $root "Rumble-Bytebot.sln"
$nugetConfig = Join-Path $root "NuGet.Config"
$artifacts = Join-Path $root "artifacts"
$package = Join-Path $root "dist\Rumble.Bot"
$archive = Join-Path $artifacts "Rumble-Bytebot-v$Version.zip"
$env:APPDATA = Join-Path $root ".local\appdata"
$env:NUGET_PACKAGES = Join-Path $root ".local\nuget\packages"
New-Item -ItemType Directory -Force -Path (Join-Path $env:APPDATA "NuGet"), $env:NUGET_PACKAGES | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $StreamerBotPath "Streamer.bot.Plugin.Interface.dll"))) {
    throw "StreamerBotPath must point to a Streamer.bot directory containing Streamer.bot.Plugin.Interface.dll."
}

& $dotnet restore $solution --configfile $nugetConfig
if ($LASTEXITCODE -ne 0) { throw "Restore failed." }
& $dotnet test $solution --configuration Release --no-restore -p:StreamerBotPath="$StreamerBotPath"
if ($LASTEXITCODE -ne 0) { throw "Build or tests failed." }
& $dotnet run --project (Join-Path $root "tools\BundleBuilder\BundleBuilder.csproj") --configuration Release --no-restore
if ($LASTEXITCODE -ne 0) { throw "Bundle generation failed." }

New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
Compress-Archive -Path (Join-Path $package "*") -DestinationPath $archive -CompressionLevel Optimal
Write-Output $archive
