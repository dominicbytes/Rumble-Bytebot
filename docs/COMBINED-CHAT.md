# Combined Chat

Rumble-Bytebot, Joysticktv-Bytebot and Altstream-Bytebot ship the same `combined-chat` folder (version 2026.10.22) and the same **[Combined Chat] Controls** action.

## Install ONLY ONE combined chat

- Keep exactly one `combined-chat` folder in a permanent location, for example `C:\StreamerBot\combined-chat`.
- Map only that folder in Streamer.bot's HTTP server, and point every OBS dock and Browser Source at it.
- When a package contains a newer chat version, replace the contents of your one folder with it. Never add a second folder or a second HTTP mapping.
- The version is in the title of `combined-chat/README.md` and in `index.html` (`bytebot-chat-version`). If yours is the same or newer, skip the copy.
- Keep one `StreamerBot.PlatformBridge.Core.dll` in Streamer.bot's `dlls` folder. Every package ships the same file, and every package's **[Combined Chat] Controls** action uses it, so the order you import packages in does not matter.

Setup, shared controls, supported events and OBS settings are in [combined-chat/README.md](../src/Rumble.Bot/combined-chat/README.md), which is included in every package's `combined-chat` folder.
