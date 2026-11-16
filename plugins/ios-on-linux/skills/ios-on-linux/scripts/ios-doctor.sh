#!/usr/bin/env bash
# Checks each layer of iPhone automation on Linux, in dependency order. The first FAIL is where to start.
DIR="${IOS_DDI_DIR:-$HOME/.local/share/go-ios-ddi}"
IOS="${IOS_BIN:-$(command -v ios || echo "$HOME/.npm-global/bin/ios")}"
MC=$(command -v mobilecli || ls ~/.npm-global/lib/node_modules/@mobilenext/mobile-mcp/node_modules/@mobilenext/mobilecli-linux-*/mobilecli-linux-* 2>/dev/null | head -1)
ok()   { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n      -> %s\n' "$1" "$2"; }
warn() { printf 'warn  %s\n      -> %s\n' "$1" "$2"; }

command -v usbmuxd >/dev/null && ok "usbmuxd installed" || fail "usbmuxd missing" "install usbmuxd (setup.md step 1)"
lsusb 2>/dev/null | grep -qi '05ac:.*iphone' && ok "iPhone on USB" || fail "no iPhone on USB" "plug in, unlock, tap Trust"
[ -x "$IOS" ] && ok "go-ios at $IOS" || fail "go-ios missing" "npm i -g go-ios"
[ -n "$MC" ] && ok "mobilecli at $MC" || fail "mobilecli missing" "add mobile-mcp (setup.md step 1)"

UDID=""
if [ -n "$MC" ]; then
  UDID=$(timeout 60 "$MC" devices 2>/dev/null | python3 -c 'import json,sys
try:
  print(next(d["id"] for d in json.load(sys.stdin)["data"]["devices"] if d["platform"]=="ios"))
except Exception: pass')
  [ -n "$UDID" ] && ok "mobilecli sees $UDID" || fail "mobilecli sees no iPhone" "check Trust; if it hangs: pkill -x mobilecli-linux"
fi

if [ -n "$UDID" ]; then
  st=$(timeout 60 "$MC" agent status --device "$UDID" 2>/dev/null)
  echo "$st" | grep -q '"status": "ok"' && ok "agent installed" || fail "agent not installed" "iphone-agent renew (setup.md step 2)"
  dm=$(timeout 30 "$IOS" devmode get --udid="$UDID" 2>/dev/null | grep -o '"DeveloperModeEnabled":[a-z]*')
  [ "$dm" = '"DeveloperModeEnabled":true' ] && ok "Developer Mode on" || fail "Developer Mode off/unknown" "Settings > Privacy & Security > Developer Mode"
  img=$(timeout 30 "$IOS" image list --udid="$UDID" 2>&1 | grep -v 'agent is not running' | grep -o '"msg":"[^"]*"' | tail -1)
  [ -n "$img" ] && [ "$img" != '"msg":"none"' ] && ok "DDI mounted" || fail "DDI not mounted" "iphone-agent mount (needed after every reboot)"
fi

if command -v xtool >/dev/null; then
  timeout 60 xtool auth status 2>/dev/null | grep -q 'Logged in' && ok "xtool has a saved login (Apple may still say it expired; that shows up on renew)" || warn "xtool not logged in" "user runs: xtool auth login (only needed to renew)"
else
  warn "xtool missing" "needed only to install/renew the agent (setup.md step 2)"
fi
if podman container exists anisette-v3 2>/dev/null; then
  curl -s -m5 http://127.0.0.1:6969/v3/client_info | grep -q client_info && ok "local anisette answering" || warn "local anisette not answering" "podman start anisette-v3"
fi
