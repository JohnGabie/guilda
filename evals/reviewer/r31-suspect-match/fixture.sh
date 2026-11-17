#!/usr/bin/env bash
# Fixture: a guilda 0.3.0 project. Plan task T2 and its brief cite D2@b0b1a542. A later spec commit adds a line to
# D2, so the link is suspect, but the task still matches the block. The last commit is the T2 code.
set -eu
git init -q -b main
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda docs/superpowers/specs src tests
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.3.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[{"name":"test","command":"node --test"}],"process":"full","explain":"full","report":{"repo":"none"}}
EOT
printf '{ "name": "fixture", "version": "0.0.0", "type": "module" }\n' > package.json
printf '.guilda/trace/\n.guilda/work/\n' > .gitignore
cat > docs/superpowers/specs/2026-11-10-greeting.md <<'MD'
# Greeting and farewell

### D1 — Greeting text (`@decided`)

- Given: the user name "Ana".
- When: greet("Ana") runs.
- Then: it returns the exact string "Hello, Ana".
- Tool: node --test.
- Test: tests/greeting.test.mjs.

### D2 — Farewell text (`@decided`)

- Given: the user name "Ana".
- When: farewell("Ana") runs.
- Then: it returns the exact string "Bye, Ana".
- Tool: node --test.
- Test: tests/farewell.test.mjs.
MD
cat > docs/superpowers/specs/2026-11-10-greeting.plan.md <<'MD'
# Greeting plan

Covers: D1, D2

### T1 — the greeting text
Uses: D1@0941709c
Owns: D1
Files it may touch: src/greeting.js, tests/greeting.test.mjs

### T2 — the farewell text
Uses: D2@b0b1a542
Owns: D2
Files it may touch: src/farewell.js, tests/farewell.test.mjs
MD
git add .guilda/config.json package.json .gitignore docs
git commit -q -m "docs: spec and plan"
cat > src/greeting.js <<'JS'
export const GREETING_PREFIX = 'Hello, ';

export function greet(name) {
  return `${GREETING_PREFIX}${name}`;
}
JS
cat > tests/greeting.test.mjs <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greet } from '../src/greeting.js';

test('greet returns the exact greeting', () => assert.equal(greet('Ana'), 'Hello, Ana'));
JS
git add src/greeting.js tests/greeting.test.mjs
git commit -q -m "feat: greeting text (T1)"
printf -- '- Why: the page shows the farewell after a logout, next to the login link.\n' >> docs/superpowers/specs/2026-11-10-greeting.md
cat > docs/BRIEF.md <<'MD'
ID / title: T2 - the farewell text
Goal: src/farewell.js exports farewell(name), which returns "Bye, <name>".
Context: docs/superpowers/specs/2026-11-10-greeting.md, block D2.
Uses: D2@b0b1a542
Files it may touch: src/farewell.js, tests/farewell.test.mjs
Tests that must pass: node --test tests/farewell.test.mjs
Acceptance: D2
Risk area: none
Deletion rules: none
Level: full
Skills: none
Base commit: HEAD~1
Mutants:
  M1: in src/farewell.js, change the value of FAREWELL_PREFIX from 'Bye, ' to 'Bye '.
MD
cat > docs/EXECUTOR-REPORT.md <<'MD'
Status: done
Branch / commit: main @ HEAD feat: farewell text (T2)
Changes: src/farewell.js - farewell and FAREWELL_PREFIX; tests/farewell.test.mjs - one test
Tests failed first: node --test tests/farewell.test.mjs, exit 1, "Cannot find module '../src/farewell.js'" (ERR_MODULE_NOT_FOUND) before src/farewell.js existed; the test failed.
Verified: node --test tests/farewell.test.mjs, exit 0, "tests 1, pass 1, fail 0".
Not verified: none
Found outside the spec: none
Questions for the Architect: none
MD
git add docs
git commit -q -m "docs: the farewell note in D2, the T2 brief and report"
cat > src/farewell.js <<'JS'
export const FAREWELL_PREFIX = 'Bye, ';

export function farewell(name) {
  return `${FAREWELL_PREFIX}${name}`;
}
JS
cat > tests/farewell.test.mjs <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farewell } from '../src/farewell.js';

test('farewell returns the exact farewell', () => assert.equal(farewell('Ana'), 'Bye, Ana'));
JS
git add src/farewell.js tests/farewell.test.mjs
git commit -q -m "feat: farewell text (T2)"
