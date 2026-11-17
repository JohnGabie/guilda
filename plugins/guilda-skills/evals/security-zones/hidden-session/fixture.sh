#!/usr/bin/env bash
set -eu
mkdir -p docs .guilda
cat > .guilda/config.json <<'JSON'
{ "security": { "riskAreas": [] } }
JSON
cat > docs/spec.md <<'MD'
# Notes app spec

## 3. Features

### 3.1 Settings language
The user picks a language from a list of 12. The choice is saved on the phone.

### 3.2 Longer visits
The app keeps a visit open for 90 days on the same phone. Each time the app opens, it asks the server for a fresh pass, and the old pass stops working after 7 days of not being used. A visit ends when the user taps Leave.
MD
