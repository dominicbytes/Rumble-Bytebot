# Combined Chat Setup

1. In Streamer.bot, enable the WebSocket Server and note its port. The default expected by this page is `8080`.
2. In Streamer.bot's HTTP Server, map a local route such as `/combined-chat` to this packaged `combined-chat` directory.
3. Open the mapped `index.html` in an OBS browser dock or browser source.
4. If the WebSocket server uses another endpoint, append it as an encoded query parameter, for example `?ws=ws%3A%2F%2F127.0.0.1%3A9000%2F`.

The client subscribes only to Twitch chat, YouTube messages, Kick chat, and custom code events. Custom events are filtered to `bridge.rumble.chat_message`. Joystick.TV events are never rendered.
