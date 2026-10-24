# Changelog

## [0.1.2-local.3] - 2026-10-22

- Pre-release test build; no GitHub release. Plugin behavior is unchanged from 0.1.2-local.2.
- Ships the standard Bytebot combined chat (2026.10.22): AltStream incoming raids appear as event rows and highlighted messages as accented chat rows. Install only one copy.

## [0.1.2-local.2] - 2026-10-15

- Pre-release test build; no GitHub release.
- Ships the standard Bytebot combined chat (2026.10.15), identical in all three Bytebot packages; install only one copy.
- Combined chat: Twitch deletes, clears, bans and timeouts remove rows; paid events are highlighted; native name colors render; scrolling up pauses auto-scroll; broken images fall back to text; AltStream redemptions, shoutouts and raids display; shared controls are no longer polled every five seconds.
- Stop, Reconnect and Start no longer overlap pollers or dispatch a poll that finishes after Stop.
- Deduplication state stays in memory and is written only when new items arrive.
- Poll failures log the underlying WinHTTP error with the API URL redacted.
- Failed polls back off exponentially to 60 seconds and reset after a success.

## [0.1.1] - 2026-08-13

- Verified the plugin build and test suite against Streamer.bot 1.0.7.
- Updated the combined-chat overlay for Streamer.bot's current Twitch EventSub emote payload.
- Normalized the shared bridge assembly version so installing both Bytebot plugins is order-independent.

## [0.1.0] - 2026-07-15

- Initial private preview.
- Added Rumble polling, normalized Streamer.bot events, deduplication, and DPAPI-protected configuration.
- Added the local Twitch, YouTube, Kick, and Rumble combined-chat surface.
