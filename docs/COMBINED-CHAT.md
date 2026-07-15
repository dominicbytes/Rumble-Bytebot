# Combined Chat

The packaged static page combines Streamer.bot's Twitch, YouTube, and Kick chat events with `bridge.rumble.chat_message` events from Rumble-Bytebot. It does not contact platform APIs directly and never receives the Rumble API URL.

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

Add a Browser Source using the same URL. A starting size of 420 by 700 works well. Do not check or Disable **Shutdown source when not visible** and **Refresh browser when scene becomes active** to preserve the current in-memory rows.

You can add the chat as a custom dock by copy-pasting the URL into the custom dock option on OBS. Note that this combined chat will not display events (such as chat point redeems). But it will give you a single place to read chat from all 4 sources.

Rumble chat and rants are populated by Rumble only while the channel is live. Use `[Rumble.Bot] Test` for an offline pipeline check.

