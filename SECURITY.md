# Security

## Sensitive values

Never submit a Rumble Live Stream API URL, returned `stream_key`, Streamer.bot WebSocket password, configuration file, log containing credentials, or unredacted platform payload.

Rumble-Bytebot stores its API URL under the current Windows user profile using Windows DPAPI. A configuration copied to another Windows user should be treated as unusable and replaced through the Configure action.

## Reporting a problem

Because this repository is private, report security problems through a private repository issue or contact Dominic Bytes through [dominicbytes.carrd.co](https://dominicbytes.carrd.co/). Revoke and regenerate an exposed Rumble API URL immediately.

