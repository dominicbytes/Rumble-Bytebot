# Building

## Requirements

- .NET SDK 10.0.301 or a compatible newer patch
- .NET Framework 4.8.1 targeting pack
- A local Streamer.bot 1.0.7 directory containing `Newtonsoft.Json.dll` and `Streamer.bot.Plugin.Interface.dll`

The Streamer.bot directory is not redistributed. Supply it to the release script:

```powershell
.\scripts\build-release.ps1 -StreamerBotPath 'C:\path\to\Streamer.bot'
```

Use `-DotNetPath` when the SDK is installed outside `PATH` and outside the repository's ignored `.local/dotnet-sdk` directory.

The script restores packages, runs Release tests, builds the import bundle, and creates `artifacts/Rumble-Bytebot-v0.1.1.zip`.
