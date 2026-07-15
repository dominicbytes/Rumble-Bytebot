# Rumble Combined Chat

Static HTML, CSS, and JavaScript combined-chat surface packaged with `Rumble.Bot`.

It will consume Streamer.bot WebSocket events for:

- `Twitch.ChatMessage`
- `YouTube.Message`
- `Kick.ChatMessage`
- `Custom.CodeEvent` for `bridge.rumble.chat_message`

It remains local, requires no Node or Docker runtime, renders chat text safely, and excludes Joystick.TV chat. It targets narrow OBS dock and Streamer.bot-adjacent layouts and renders native emotes and badges from structured source fields when available. See `SETUP.md`.
