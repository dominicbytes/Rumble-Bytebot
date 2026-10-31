# Bytebot combined chat — version 2026.10.31

This `combined-chat` folder is identical in Rumble-Bytebot, Joysticktv-Bytebot and Altstream-Bytebot. It shows Twitch, YouTube, Kick, Rumble, AltStream and (when enabled) Joystick.TV chat in one feed.

## Install ONLY ONE combined chat

Install exactly one `combined-chat` folder, no matter how many Bytebot plugins you use.

- Keep one folder in a permanent location, for example `C:\StreamerBot\combined-chat`.
- Map only that folder in Streamer.bot's HTTP server, and point every OBS dock and Browser Source at it.
- When a plugin package includes a newer chat version than the one you have, replace the **contents** of your one folder with the package's `combined-chat` contents. Do not add a second folder or a second HTTP mapping.
- Check the installed version in this README's title or in `index.html` (`bytebot-chat-version`). Skip the copy when your installed version is the same or newer.

Every package also ships the same **[Combined Chat] Controls** action, built on the shared `StreamerBot.PlatformBridge.Core.dll`. Importing it from any package gives the same action, so import order does not matter. Keep one copy of `StreamerBot.PlatformBridge.Core.dll` in Streamer.bot's `dlls` folder; every package ships the same file.

## Setup

1. Streamer.bot **Servers/Clients > WebSocket Server**: address `127.0.0.1`, port `8080`, endpoint `/`, Auto Start on. Authentication must stay disabled for this display.
2. Streamer.bot **Servers/Clients > HTTP Server**: host `127.0.0.1`, port `7474`, Auto Start on. Add the mapping `combined-chat` pointing at your one folder.
3. Open `http://127.0.0.1:7474/combined-chat/index.html` and confirm the status reads **Connected**.
4. OBS custom docks need that URL. A Browser Source can use the URL or the local `index.html` file (the file keeps loading while Streamer.bot is closed). A starting size of 420 × 700 works well; leave **Shutdown source when not visible** off.
5. After replacing the folder, reload each dock and Browser Source once.

Use `?ws=ws://127.0.0.1:PORT/` on every display if your WebSocket port differs. Keep the WebSocket server on loopback.

## What the display does

- **Platforms** and **Clear chat** are shared across every open display through the persisted Streamer.bot global `bytebot.sharedChat.controls.v1`. Joystick.TV starts disabled. Clear chat clears the display only; it never moderates a platform.
- Native Twitch, YouTube and Kick emotes, badges and name colors render when Streamer.bot supplies them. Broken images fall back to their names.
- Paid events (rants, cheers, Super Chats, Kicks, tips, wheel spins) are highlighted.
- Twitch deleted messages, chat clears, bans and timeouts remove the affected Twitch rows from the display and its saved history. YouTube and Kick removal is not yet supported because Streamer.bot does not document those payloads.
- AltStream message deletes and chat clears remove AltStream rows. AltStream redemptions, shoutouts, outgoing raids and incoming raids appear as event rows, and highlighted messages appear as accented chat rows. AltStream follows are streamer-only on AltStream, so they fire triggers but are not shown.
- Scrolling up with the mouse wheel, touch, scroll keys or the scrollbar pauses auto-scroll. A **new messages** button appears; click it or scroll to the bottom to resume. Nothing else pauses it, so an OBS Browser Source that cannot be scrolled always stays on the newest message, including after scene switches.
- Each display keeps up to 200 rows for seven days so it can redraw immediately. It cannot recover messages missed while it was offline.
- Rumble stream-status notices and Joystick presence, viewer-count and follower-count notices are never shown.

## Overlay Event action

With Rumble-Bytebot installed, run `[Rumble.Bot] Overlay Event` with `platform` (`twitch`, `youtube`, `kick` or `rumble`) and `message`; optional `eventType` and `userName`/`displayName`. The page renders the text without HTML.

Rumble and Joystick.TV need their plugins running for live data. Rumble chat only arrives while the Rumble channel is live; use `[Rumble.Bot] Test` offline.
