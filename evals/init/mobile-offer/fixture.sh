#!/usr/bin/env bash
set -euo pipefail
git init -q
printf '{"name":"demo","version":"1.0.0","scripts":{"test":"node --test"}}\n' > package.json
mkdir -p ios android
printf 'platform :ios, "15.0"\n' > ios/Podfile
printf 'include ":app"\n' > android/settings.gradle
printf '{"name":"demo","version":"1.0.0","dependencies":{"react-native":"0.74.0"},"scripts":{"test":"node --test"}}\n' > package.json
printf "console.log(1);\n" > index.js
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -q -m "fixture"
