# Joystick Presence Display Fix

Result: FIX_READY_FOR_RETEST

## Repair Contract

- Finding: Joystick user-entered and user-left notifications appear in combined chat.
- Source baseline: a0e4f7e on main.
- Scope: the packaged overlay and its regression tests.
- Expected behavior: hide typed presence events, including cached notices, while keeping real chat and other events visible.
- Streamer.bot presence triggers and platform connections remain unchanged.

## Evidence

- Before the fix, the new regression test failed with four displayed presence rows instead of zero.
- After the fix, node tests/combined-chat-smoke.js passes.
- Coverage includes both event-name/argument envelope variants, persisted history, ordinary chat containing the same words, and follows.
- The full .NET suite passes: six core tests and three platform tests.
- The normal build-release script generated artifacts/Rumble-Bytebot-v0.1.1-presence-fix.zip against Streamer.bot 1.0.7.
- The package contains the corrected combined-chat/app.js.

## Retest Bar

Reload an OBS browser source or dock running the updated overlay. User-entered and user-left events must produce no rows; previously cached presence rows must not return. Ordinary chat, follows, tips, and subscriptions must remain visible.

The checks use deterministic event fixtures. No live account session was required for this display-only change.
