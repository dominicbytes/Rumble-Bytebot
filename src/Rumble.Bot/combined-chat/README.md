# Shared combined chat — September 10 update

One identical `combined-chat` folder is bundled with both plugins. Keep one active folder; every OBS dock/source connects to the same Streamer.bot WebSocket endpoint. HTTP and local-file displays are supported. No Node server is required for normal use.

## Important: this update requires an action import and a DLL update

1. Back up the existing plugin DLLs and chat folder, and export your plugin actions.
2. Close Streamer.bot completely. Copy the package's `dlls` contents into your real Streamer.bot `dlls` folder. If updating both plugins, use both plugin DLLs and only one copy of `StreamerBot.PlatformBridge.Core.dll`.
3. Replace the entire `combined-chat` folder, including assets.
4. Start Streamer.bot and import the package's `.sb` bundle. It includes **[Combined Chat] Controls**. Both packages use the same ID for this shared action; only one shared Controls action is needed. Preserve any personal modifications when reviewing the import.
5. Reload each OBS dock and browser source once to load this version. After that, changing a platform or clicking Clear chat updates all connected displays without refreshing.

Unlike the previous HTML-only update, replacing just HTML is NOT sufficient. If shared controls remain disabled, confirm the new DLL is installed, Streamer.bot was restarted, and **[Combined Chat] Controls** is imported and enabled. The display says **Controls synced across displays** when ready.

## Shared controls

Use **Platforms** to select any combination of Twitch, YouTube, Kick, Rumble and Joystick.TV. Choices are now saved centrally in the dedicated persisted Streamer.bot global `bytebot.sharedChat.controls.v1`, not independently per browser. Initial defaults enable all except Joystick. Old `platforms=` URL parameters no longer override the shared state.

**Clear chat** clears the combined display and its saved history across connected views. It does NOT delete messages from Twitch, YouTube, Kick, Rumble or Joystick, nor modify platform moderation or reward state. A view that was disconnected applies the saved clear when it reconnects. New chat continues normally. Clear has no undo; use it intentionally.

Each view still caches up to 200 received entries for seven days so history can render immediately; it is not a centralized archive and cannot retrieve messages missed while that view was offline. Platform filtering and clear state are centralized. The display deliberately ignores Rumble stream-status notices, including old cached status rows.

## Connection and OBS

Default WebSocket: `ws://127.0.0.1:8080/`. Override using `?ws=ws://127.0.0.1:PORT/` on every display. Keep the server restricted to loopback; this page currently supports unauthenticated local connections. Enable the WebSocket server's auto-start setting.

For a Browser Source, the local `index.html` can load even while Streamer.bot's HTTP server is off. A custom dock can continue using its existing HTTP URL. Both will synchronize through the same WebSocket connection endpoint, even with different browser storage. The page retries lost WebSocket connections every five seconds.

OBS Browser Sources can use **Interact** to operate the controls. Do not point a production source at the development fake-server URL.

Username resolution accepts native structured event users, flat user-name fields, and the Streamer.bot `user`/`userName`/`displayName` action variables used by the Rumble Overlay Event action. A username must be present in the originating event or action arguments; the display does not invent one.

Rumble/Joystick require their respective plugin connections for live data. Rumble public-API limitations still apply. Private whispers and private moderation payloads are not shown.
