#!/usr/bin/env bash
# Fixture for the case lab-dispatch.
set -eu
mkdir -p .guilda
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.2.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[],"process":"light","explain":"full","report":{"repo":"none"}}
EOT
mkdir -p src tests
printf "export const add = (a, b) => a + b;\n" > src/math.js
printf "import { test } from \"node:test\";\ntest(\"a\", () => {});\n" > tests/a.test.js
printf "import { test } from \"node:test\";\ntest(\"b\", () => {});\n" > tests/b.test.js
printf "import { test } from \"node:test\";\ntest(\"c\", () => {});\n" > tests/c.test.js
printf "# Sample\nA tiny project with three test files.\n" > README.md
