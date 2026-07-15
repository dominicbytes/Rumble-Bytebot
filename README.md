# Rumble-Bytebot

Rumble-Bytebot is a Streamer.bot integration for the documented Rumble Live Stream API. It adds normalized Rumble triggers and packages a local combined-chat surface for Twitch, YouTube, Kick, and Rumble.

> Status: private `0.1.0` preview for Streamer.bot 1.0.4 on Windows with .NET Framework 4.8.1.

## Features

- Rumble chat messages and rants
- Follows, subscriptions, and gifted subscriptions
- Live status, viewer count, likes, dislikes, and categories
- Restart-safe deduplication with silent first-poll baselining
- DPAPI protection for the private Rumble API URL
- Streamer.bot actions for Configure, Start, Stop, Reconnect, Status, and Test
- Local Twitch, YouTube, Kick, and Rumble combined-chat page for OBS

Rumble support is read-only. The documented API does not provide outbound chat, moderation, raids, or conventional reward-redemption endpoints.

## Install

Download `Rumble-Bytebot-v0.1.0.zip` from the repository's Releases page and follow [the installation guide](docs/INSTALLATION.md). Combined-chat setup is covered in [the overlay guide](docs/COMBINED-CHAT.md).

## Security

The Rumble API URL is a credential. It is stored locally with Windows DPAPI and must never be placed in repository files, issues, screenshots, or logs. See [Security](SECURITY.md).

## Development

Build instructions are in [docs/BUILDING.md](docs/BUILDING.md). Event names and arguments are documented in [docs/EVENTS.md](docs/EVENTS.md).

## License

MIT License. See [LICENSE](LICENSE).

## About Dominic Bytes

Greetings! I am Dominic Bytes, the synth walker. I hail from the distant future. Where brains occupy robot bodies, time travel is a trip to the corner store, and the neon glow of our attire is powered by the light of our souls. Join me on a 1.21 gigawatt powered journey of chill vibes with gaming, anime, movies, and more!

- [Website](https://dominicbytes.carrd.co/)
- [X](https://x.com/DominicBytes)
- [Twitch](https://www.twitch.tv/dominicbytes)
- [YouTube](http://www.youtube.com/@DominicBytes)
- [Kick](https://kick.com/dominicbytes)

