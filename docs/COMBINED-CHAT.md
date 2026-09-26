# Combined Chat

The packaged static page combines Streamer.bot's Twitch, YouTube, and Kick chat and stream events with Rumble-Bytebot chat and detectable stream events. It does not contact platform APIs directly and never receives the Rumble API URL.

Rows use the supplied platform logos instead of colored bars. Native badges and emotes are rendered from structured event fields, with emote names replaced in place by their images. The newest 200 rows are stored in browser-local storage for seven days and restored immediately when the page loads.

## Streamer.bot servers

1. Open **Servers/Clients > WebSocket Server**.
2. Use address `127.0.0.1`, port `8080`, endpoint `/`, and enable Auto Start.
3. Start the WebSocket server. Authentication enforcement must remain disabled for the current display-only client.
4. Open **Servers/Clients > HTTP Server**.
5. Use host `127.0.0.1`, port `7474`, and enable Auto Start.
6. Add mapping path `combined-chat` to the extracted release's `combined-chat` directory.
7. Start or restart the HTTP server.

Open `http://127.0.0.1:7474/combined-chat/index.html` and confirm the status reads **Connected**.

## OBS Browser Source

For the most reliable restart behavior, add an OBS Browser Source, enable **Local file**, and select the extracted `combined-chat/index.html`. A starting size of 420 by 700 works well. Leave **Shutdown source when not visible** disabled. Because the page is loaded from disk instead of Streamer.bot's HTTP server, it remains available while Streamer.bot is closed. It reconnects to Streamer.bot every five seconds after startup and resubscribes automatically.

OBS custom docks require a URL, so use the mapped HTTP URL for a dock. Chat and supported stream events appear together in arrival order.

## Generic Overlay Event action

Run `[Rumble.Bot] Overlay Event` from a Streamer.bot action with these arguments:

- `platform` (required): `twitch`, `youtube`, `kick`, or `rumble`
- `message` (required): text to display
- `eventType` (optional): a stable custom event label
- `userName` or `displayName` (optional): prepended to the message

The action emits `bridge.overlay.event`; the page accepts the event without receiving arbitrary HTML or raw platform payloads.

Rumble chat and rants are populated by Rumble only while the channel is live. Use `[Rumble.Bot] Test` for an offline pipeline check.

