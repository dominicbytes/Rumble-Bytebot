# Installation

## Requirements

- Windows
- Streamer.bot 1.0.7
- .NET Framework 4.8.1
- A private Rumble Live Stream API URL

## Install the plugin

1. Close Streamer.bot.
2. Extract the release ZIP.
3. Copy `dlls/Rumble.Bot.dll` and `dlls/StreamerBot.PlatformBridge.Core.dll` into Streamer.bot's `dlls` directory.
4. Start Streamer.bot.
5. Open **Import** and import `Rumble.Bot.sb`.
6. Run `[Rumble.Bot] Configure` and enter the private Rumble Live Stream API URL.
7. Run `[Rumble.Bot] Start`.
8. Run `[Rumble.Bot] Status` and confirm `Configured=True`, `Running=True`, and `PollStatus=Succeeded`.
9. Run `[Rumble.Bot] Test` to emit a synthetic chat event.

## Combined chat

Install ONLY ONE combined chat. Rumble-Bytebot, Joysticktv-Bytebot and Altstream-Bytebot ship the same `combined-chat` folder. Keep a single folder, replace its contents only when this package's chat version (2026.10.31) is newer, and never map a second copy. Keep one `StreamerBot.PlatformBridge.Core.dll`; every package ships the same file. See [COMBINED-CHAT.md](COMBINED-CHAT.md).

## Startup

The import initializes custom triggers when Streamer.bot starts. It does not automatically configure or start polling.

## Files created at runtime

Configuration and deduplication state are stored outside the plugin folder under the current Windows user's local application data. The API URL is protected with CurrentUser DPAPI. Do not move those files into the repository.
