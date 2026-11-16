# Control branch

Prefer the mobile-mcp tools (`mobile_take_screenshot`, `mobile_click_on_screen_at_coordinates`, `mobile_list_elements_on_screen`, ...) when they are loaded in the session. They only appear in a session started after mobile-mcp was added, so if they are missing, use `mobilecli` directly; it is the same engine.

Find the binary and device once:

```bash
MC=$(command -v mobilecli || ls ~/.npm-global/lib/node_modules/@mobilenext/mobile-mcp/node_modules/@mobilenext/mobilecli-linux-amd64/mobilecli-linux-amd64)
UDID=$($MC devices | python3 -c 'import json,sys; print(next(d["id"] for d in json.load(sys.stdin)["data"]["devices"] if d["platform"]=="ios"))')
```

## Look before acting

```bash
OUT=$(mktemp -d)                                       # scratch folder for captures
$MC screenshot --device $UDID --output "$OUT/shot.png"  # then Read the image
$MC dump ui --device $UDID                             # JSON tree: label, type, rect (points)
```

Screenshots are in pixels, taps are in **points**. On a 3x phone (most current iPhones) divide pixel coordinates by 3. If you shrank the image to view it, undo that first. The UI tree already gives points, so prefer it.

## Act

```bash
$MC io tap X,Y --device $UDID
$MC io swipe X1,Y1,X2,Y2 --device $UDID
$MC io text "hello" --device $UDID          # types into the focused field
$MC io button HOME --device $UDID
```

Tap by name instead of guessing coordinates:

```bash
python3 <skill-dir>/scripts/tap_by_label.py "General"           # prints "x,y" or exits 1
$MC io tap $(python3 <skill-dir>/scripts/tap_by_label.py "General") --device $UDID
```

Practical notes:
- Swipes have momentum and overshoot. For long lists, use the app's search field (in Settings: tap Search, `io text`, tap the result) instead of scrolling.
- Items under a floating search bar or tab bar can't be tapped; scroll a little first.
- Wait about a second after a tap before the next screenshot or dump, so the animation has finished.
- Re-read the screen after each step instead of chaining blind taps.

## When it breaks

| Symptom | Cause | Fix |
|---|---|---|
| Any command hangs | stale daemon after reboot or reinstall | `pkill -x mobilecli-linux`, retry |
| "agent is not installed" | agent missing or deleted | `scripts/iphone-agent renew` |
| "timed out waiting for WebDriverAgent", daemon log has `port=0` | DDI not mounted (phone rebooted) | `scripts/iphone-agent mount`, then restart daemon |
| same timeout, phone log says "Timed out while enabling automation mode" | UI Automation off | iPhone: Settings > Developer > Enable UI Automation; approve the passcode prompt on the phone |
| agent launches then is killed, about 7 days after install | free signature expired | `scripts/iphone-agent fix` |
| `xtool` login fails with HTTP 429 | Apple rate limit after many logins | wait 30 min to a few hours; don't retry in a loop |

To read the phone's own log while reproducing a failure:

```bash
OUT=$(mktemp -d)
timeout 60 ios syslog --udid=$UDID > "$OUT/syslog.txt" &   # go-ios `ios` on PATH
# reproduce, then:
grep -i 'runner\|xctest\|testmanager\|denied' "$OUT/syslog.txt"
```

mobilecli's daemon log is `~/.mobilecli/daemon.log`.
