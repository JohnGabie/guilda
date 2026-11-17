#!/usr/bin/env bash
# Fixture: a guilda 0.3.0 project. Plan task T1 and its brief have no Uses: line; T2 cites D2 with its current hash.
# The last commit is the T1 code, which is correct in each other way.
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
Owns: D1
Files it may touch: src/greeting.js, tests/greeting.test.mjs

### T2 — the farewell text
Uses: D2@b0b1a542
Owns: D2
Files it may touch: src/farewell.js, tests/farewell.test.mjs
MD
cat > docs/BRIEF.md <<'MD'
ID / title: T1 - the greeting text
Goal: src/greeting.js exports greet(name), which returns "Hello, <name>".
Context: docs/superpowers/specs/2026-11-10-greeting.md, block D1.
Files it may touch: src/greeting.js, tests/greeting.test.mjs
Tests that must pass: node --test tests/greeting.test.mjs
Acceptance: D1
Risk area: none
Deletion rules: none
Level: full
Skills: none
Base commit: HEAD~1
Mutants:
  M1: in src/greeting.js, change the value of GREETING_PREFIX from 'Hello, ' to 'Hello '.
MD
cat > docs/EXECUTOR-REPORT.md <<'MD'
Status: done
Branch / commit: main @ HEAD feat: greeting text (T1)
Changes: src/greeting.js - greet and GREETING_PREFIX; tests/greeting.test.mjs - one test
Tests failed first: node --test tests/greeting.test.mjs, exit 1, "Cannot find module '../src/greeting.js'" (ERR_MODULE_NOT_FOUND) before src/greeting.js existed; the test failed.
Verified: node --test tests/greeting.test.mjs, exit 0, "tests 1, pass 1, fail 0".
Not verified: none
Found outside the spec: none
Questions for the Architect: none
MD
git add .guilda/config.json package.json .gitignore docs
git commit -q -m "docs: spec, plan, the T1 brief and report"
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
