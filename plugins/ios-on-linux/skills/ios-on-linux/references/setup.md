# Setup branch

Goal: mobile-mcp controlling a physical iPhone from Linux, no Mac. Simulators need Xcode and are impossible on Linux; say so if asked.

Work through the steps in order and verify each one before moving on. `scripts/ios-doctor.sh` checks all of them.

## 1. Host packages

- `usbmuxd` (Fedora: usually preinstalled; `dnf install usbmuxd`). Plug the phone in, unlock it, tap **Trust**.
- Node 20+, then: `claude mcp add -s user mobile-mcp -e MOBILEMCP_DISABLE_TELEMETRY=1 -- npx -y @mobilenext/mobile-mcp@latest`
  (mobile-mcp sends anonymous usage events to PostHog and a Scarf pixel unless that variable is set.)
- go-ios for the DDI: `npm i -g go-ios` (binary `~/.npm-global/bin/ios` or wherever the npm prefix is).
- Check: `mobilecli devices` lists the phone with `"type": "real"`.

## 2. Sign and install the agent with xtool

`mobilecli agent install --provisioning-profile ...` cannot work on Linux: it re-signs with macOS `codesign` and the keychain. Use xtool (xtool-org/xtool) instead, which signs on Linux and works with a **free** Apple ID.

1. Download the AppImage from the xtool releases, `chmod +x`, put it on PATH as `xtool`.
2. The user runs `xtool auth login` in their own terminal (Apple ID, password, 2FA). A free account gives a "Personal Team" automatically; limits: 7-day signatures, 3 sideloaded apps, 10 new app IDs per week. xtool itself suggests a secondary Apple ID because this is a private API.
3. Download the agent, verify, install:
   ```bash
   curl -fsSLO https://github.com/mobile-next/devicekit-ios/releases/download/<ver>/devicekit-ios-runner.ipa
   sha256sum devicekit-ios-runner.ipa   # compare with the pin in mobilecli's commands/agent.go
   xtool install --udid $UDID --usb devicekit-ios-runner.ipa
   ```
   The agent version mobilecli expects is `agentVersionIOS` in mobilecli's `commands/agent.go`. xtool renames the bundle to `XTL-<TEAMID>.com.mobilenext.devicekit-iosUITests.xctrunner`; that's fine, mobilecli matches the agent by suffix. `<TEAMID>` is your own Apple team ID: `xtool` prints it at login, and it is also in your Apple Developer account under Membership details.

## 3. iPhone settings

1. Settings > Privacy & Security > **Developer Mode** on (the phone restarts and asks to confirm). It only appears after a developer-signed app is installed, which step 2 did.
2. Settings > General > VPN & Device Management > the Apple ID > **Trust**.
3. Settings > Developer > **Enable UI Automation**. Without it, the agent dies with "Timed out while enabling automation mode".

## 4. Developer Disk Image

iOS 17+ needs a personalized DDI, signed by Apple's TSS server (`gs.apple.com`) for this exact phone. That server uses **Apple Root CA**, which Fedora and others don't ship, so go-ios fails with `x509: certificate signed by unknown authority`. Trust it for this one command only:

```bash
DIR=~/.local/share/go-ios-ddi; mkdir -p $DIR
curl -fsSL https://www.apple.com/appleca/AppleIncRootCertificate.cer -o $DIR/apple-root.cer
openssl x509 -inform DER -in $DIR/apple-root.cer -out $DIR/apple-root.pem
openssl x509 -in $DIR/apple-root.pem -noout -fingerprint -sha256
# must be B0:B1:73:0E:CB:C7:FF:45:05:14:2C:49:F1:29:5E:6E:DA:6B:CA:ED:7E:2C:68:C5:BE:91:B5:A1:10:01:F0:24
mkdir -p $DIR/certs && cp $DIR/apple-root.pem $DIR/certs/
# system CA folder (newer Fedora ships only a hashed folder, no single bundle file)
SYS_CERTS=$(python3 -c 'import ssl; print(ssl.get_default_verify_paths().capath)')
SSL_CERT_DIR="$SYS_CERTS:$DIR/certs" ios image auto --basedir=$DIR --udid=$UDID
```

Use an **absolute** `--basedir`; a relative one fails with "safeJoin: path would escape base directory". The image is downloaded from a third-party mirror, but the phone only mounts it with Apple's per-device signature, so a tampered image would be rejected.

## 5. Install the helper and test

Copy `scripts/iphone-agent` to `~/.local/bin/` and edit `UDID` to `<your-iphone-udid>` (or leave it empty for auto-detect). Find your own value with `mobilecli devices` (the `id` field of the iOS device) or with `ios list`. Then follow the control branch: screenshot, one tap, read back.

## Optional: local anisette (no third-party server)

xtool needs "anisette" headers (a machine identity Apple requires). By default it gets them from `mac-ani.jkcoxson.com`, a community server. The Apple password never goes there (login is SRP, directly with Apple), but that server generates the identity your login is bound to. To run it locally:

```bash
podman volume create anisette-v3-data
# ANISETTE_DATA = the data folder inside the image, as given in the dadoum/anisette-v3-server README
podman run -d --name anisette-v3 --restart unless-stopped -p 127.0.0.1:6969:6969 \
  -v anisette-v3-data:"$ANISETTE_DATA" docker.io/dadoum/anisette-v3-server:latest
systemctl --user enable podman-restart.service
curl -s http://127.0.0.1:6969/v3/client_info   # should return JSON
```

Gotchas found the hard way:
- A bind-mounted host folder fails with "Permission denied" under rootless podman; use a named volume.
- Publish IPv4 only. Publishing `[::1]` too makes clients connect over IPv6, get reset, and never fall back.
- xtool 1.24.0 hard-codes the server URL and **crashes on any URL with a port** (upstream bug: `HTTPClientProtocol.swift` puts `host:port` into `URLComponents.host`). It needs a source build with two small changes: read `XTOOL_ANISETTE_URL` in `OmnisetteADIProvider.swift`, and split host/port in `HTTPClientProtocol.swift`. Build with podman from the repo's Dockerfile (target `build-xtool`) after replacing `FROM swift:` with `FROM docker.io/library/swift:` and `ADD --keep-git-dir=true <repo>#<tag> <dir>` with `RUN git clone --branch <tag> <repo> <dir>`; podman supports neither short names without a TTY nor `--keep-git-dir`. Patching the string inside the binary does not work: it still hits the port crash.
- After switching, move `XTLProvisioningInfo` and `XTLRoutingInfo` out of `~/.config/xtool/data` and log in again. Several fresh identities in a short time can trigger HTTP 429 from Apple; wait it out.
- Keep `~/.config/xtool` at mode 700/600; it holds the auth token.
