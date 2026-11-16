---
name: ios-on-linux
description: Control a real iPhone from a Linux PC (screenshots, taps, typing, opening apps, reading the screen) through mobile-mcp / mobilecli, and set that up from scratch without a Mac. Use this whenever the user wants Claude to look at or operate their iPhone, asks to take an iPhone screenshot, tap, swipe or type on the phone, open or test an iOS app on a physical device, or when mobile-mcp / mobilecli fails on iOS with errors like "agent is not installed", "timed out waiting for WebDriverAgent", hangs, or an expired signature. Also use it when someone wants mobile-mcp, xtool, go-ios, a Developer Disk Image or anisette working on Linux, even if they only say "make my iPhone work with Claude" or "renew the iPhone agent".
---

# iPhone automation on Linux

mobile-mcp drives iOS through `mobilecli`, which needs an on-device agent (devicekit-ios, an XCUITest runner). On macOS that is easy; on Linux three things the docs skip have to be handled by hand: signing the agent without `codesign`, mounting the Developer Disk Image (DDI), and keeping the mobilecli daemon healthy.

## Pick the branch

- **Control**: the setup already exists (`mobilecli devices` lists the iPhone, an app named "Device Kit" is on the phone) and the user wants something done on the phone, or something that used to work stopped working. Read `references/control.md`.
- **Setup**: nothing is installed yet, the agent was never installed, or the user wants to reproduce this on another machine. Read `references/setup.md`, then come back to control to test.

If unsure, run the check below; it tells you which branch you are in.

```bash
bash <skill-dir>/scripts/ios-doctor.sh
```

It reports, in order: usbmuxd, the phone over USB, mobilecli, the agent, Developer Mode, the mounted DDI, xtool login, and the local anisette server. The first failing line is where to start.

## Things that are true in both branches

- **A stuck daemon looks like a hang.** After the phone reboots or the agent is reinstalled, mobilecli's background daemon keeps a dead tunnel and every command waits forever. Restart it with `pkill -x mobilecli-linux` (the process name is truncated to 15 chars). Do not use `pkill -f <pattern>`: the pattern also matches the shell running your command and kills it.
- **Every iPhone reboot unmounts the DDI.** Symptom: the agent never answers and the daemon log shows connections to `port=0`. Fix: `scripts/iphone-agent mount`.
- **Free Apple ID signatures last 7 days.** Symptom after a week: the agent stops launching. Fix: `scripts/iphone-agent fix`.
- **Privacy.** Screenshots and the UI tree show whatever is on the phone (messages, names, notifications). Only open apps the user asked for.
- **Ask before you send, delete or buy.** Before an action that sends, deletes or buys on the phone (a message, a post, a purchase, a deletion), ask the user and wait for an explicit go-ahead for that specific action.
- **Apple login is the user's job.** `xtool auth login` asks for the Apple ID password and a 2FA code; ask the user to run it in their own terminal. Never ask for the password in chat.
