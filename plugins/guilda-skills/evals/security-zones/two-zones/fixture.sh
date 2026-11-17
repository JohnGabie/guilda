#!/usr/bin/env bash
set -eu
mkdir -p docs .guilda
cat > .guilda/config.json <<'JSON'
{ "security": { "riskAreas": [] } }
JSON
cat > docs/spec.md <<'MD'
# Notes app spec

## 4. Features

### 4.1 Sign-in with a one-time code
The user types an email address. The server sends a six-digit code that is valid for 10 minutes. The user types the code and the app opens the notes of that account.

### 4.2 Export of the notes as a ZIP file
The user taps Export. The server builds a ZIP file with every note of the account and its attachments, including the names and phone numbers that the user saved in notes, and emails a download link.

### 4.3 Footer colours
The footer uses the brand grey on light themes and the brand white on dark themes. No data enters or leaves.
MD
