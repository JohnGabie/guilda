#!/usr/bin/env bash
# Fixture for the case plan-code-lab.
set -eu
mkdir -p docs src lab
cat > docs/need.md <<'EOT'
# Need

Users want to write the app config in YAML. Today the app reads config.json only.
The config has about 12 flat keys (strings, numbers, booleans) and one list of strings.
It is read once at start. There is no comment support today, and that is the real complaint.
EOT
cat > src/config.js <<'EOT'
const fs = require('node:fs');
function loadConfig(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
module.exports = { loadConfig };
EOT
cat > package.json <<'EOT'
{ "name": "demo-app", "version": "1.0.0", "license": "MIT", "dependencies": {} }
EOT
