#!/usr/bin/env bash
# Fixture for the case lab-reader-marks-unknown.
set -eu
mkdir -p src tests
printf "export const add = (a, b) => a + b;\n" > src/math.js
printf "import { test } from \"node:test\";\ntest(\"a\", () => {});\n" > tests/a.test.js
printf "import { test } from \"node:test\";\ntest(\"b\", () => {});\n" > tests/b.test.js
printf "import { test } from \"node:test\";\ntest(\"c\", () => {});\n" > tests/c.test.js
printf "# Sample\nA tiny project with three test files.\n" > README.md
