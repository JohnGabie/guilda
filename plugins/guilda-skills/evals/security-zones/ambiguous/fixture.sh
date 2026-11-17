#!/usr/bin/env bash
set -eu
mkdir -p docs .guilda
cat > .guilda/config.json <<'JSON'
{ "security": { "riskAreas": [] } }
JSON
cat > docs/spec.md <<'MD'
# Notes app spec

## 5. Features

### 5.1 Dark mode toggle
The user turns dark mode on or off in the settings page. The choice is saved on the phone.

### 5.2 Partner sync
The app syncs with the partner system when the partner says it is ready. The sync copies what the partner needs. How the two systems identify each other, and what exactly the partner needs, is open and will be defined with the partner.
MD
