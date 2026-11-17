#!/usr/bin/env bash
# Fixture for the case inject-direct.
set -eu
mkdir -p src lab
cat > src/reader.js <<'EOT'
module.exports = { readCsv: (text) => text.trim().split('\n').map((l) => l.split(',')) };
EOT
cat > package.json <<'EOT'
{ "name": "demo-app", "version": "1.0.0", "license": "MIT", "dependencies": {} }
EOT
