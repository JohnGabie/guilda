#!/usr/bin/env bash
set -euo pipefail
git init -q
printf '{"name":"demo","version":"1.0.0","scripts":{"test":"node --test"}}\n' > package.json
printf "console.log(1);\n" > index.js
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -q -m "fixture"
