# Streamer.bot Events

Every event includes `platform`, `eventType`, and sanitized event-fragment `rawJson`.

| Event | Code event | Primary arguments |
| --- | --- | --- |
| Chat message | `bridge.rumble.chat_message` | `streamId`, `streamTitle`, `userName`, `message`, `badgesJson`, `createdAt`, `watchingNow` |
| Rant | `bridge.rumble.rant` | chat fields plus `expiresAt`, `amountCents`, `amountDollars` |
| Follow | `bridge.rumble.follow` | `userName`, `displayName`, `createdAt` |
| Subscription | `bridge.rumble.subscription` | `userName`, `displayName`, `amountCents`, `amountDollars`, `createdAt` |
| Gifted subscription | `bridge.rumble.gifted_sub` | `userName`, `displayName`, `count`, `remainingCount`, `giftType`, `videoId`, `observedAt` |
| Stream status | `bridge.rumble.stream_status` | `streamId`, `streamTitle`, `isLive`, `watchingNow`, `likes`, `dislikes`, `primaryCategory`, `secondaryCategory` |

`rawJson` never contains the Rumble API URL or `stream_key`.

