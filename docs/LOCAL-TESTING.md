# Local Reliability Test - 0.1.2-local.3

This is a pre-release test build with no GitHub release. Triggers, event arguments, the import bundle actions and the deduplication file format are unchanged. It also ships the standard Bytebot combined chat (version 2026.10.22), identical in the Rumble, Joystick and AltStream packages.

## Changes

- Stop, Reconnect and Start no longer run two pollers at once, and a poll that finishes after Stop is discarded.
- Deduplication state is loaded once and written only when new items arrive.
- Poll failures log the underlying WinHTTP error instead of "Exception has been thrown by the target of an invocation." The API URL is redacted.
- Failed polls wait twice as long after each consecutive failure, up to 60 seconds (with a 2-second interval: 4, 8, 16, 32, 60), and return to the normal interval after one success.

## Upgrade

1. Close Streamer.bot.
2. Back up `Rumble.Bot.dll` and `StreamerBot.PlatformBridge.Core.dll` from Streamer.bot's `dlls` directory, and your `combined-chat` folder, for rollback.
3. Copy `dlls/Rumble.Bot.dll` and `dlls/StreamerBot.PlatformBridge.Core.dll` into Streamer.bot's `dlls` directory. The core DLL is the same file in every Bytebot package; keep one copy.
4. Install ONLY ONE combined chat. If your single existing `combined-chat` folder is older than 2026.10.22, replace its contents with this ZIP's `combined-chat` contents. Never map a second copy. See [COMBINED-CHAT.md](COMBINED-CHAT.md).
5. Start Streamer.bot. Re-importing `Rumble.Bot.sb` is not required because the action code is unchanged. Reload each OBS dock and Browser Source.
6. Run `[Rumble.Bot] Start`, then `[Rumble.Bot] Status`. Confirm `Running=True` and `PollStatus=Succeeded`.

Existing deduplication state is reused, so recent Rumble items are not replayed.

## Live Checklist

1. **Reconnect does not duplicate.** While live, run `[Rumble.Bot] Reconnect` three times quickly, then post one Rumble chat message. Confirm one `bridge.rumble.chat_message` in Action History and `Running=True` in Status.
2. **Stop is quiet.** Run Stop, post a chat message, wait 30 seconds and confirm nothing fires. Run Start; that message fires once as a catch-up item.
3. **State file is quiet.** With chat idle, run this twice about 30 seconds apart in PowerShell and confirm the time does not change:
   `(Get-Item "$env:LOCALAPPDATA\StreamerBot.PlatformBridge\Rumble.Bot\dedupe.json").LastWriteTime`
4. **Readable errors and backoff.** Disconnect the network for about two minutes. Confirm one readable `Rumble poll failed:` line (for example a name-resolution or timeout message) and `PollStatus=Failed`. Reconnect the network; within about 60 seconds the log shows `Rumble polling recovered.`
5. **No URL in logs.** Search the Streamer.bot log for `key=` and `livestream-api`; neither should appear.

## Rollback

Close Streamer.bot, restore the backed-up DLLs and `combined-chat` folder, and start Streamer.bot again.
