#!/usr/bin/env bash
# Fixture: a project with a base commit and one task commit (clamp), a brief with two mutants, and the Executor report.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
printf '{ "name": "fixture", "version": "0.0.0", "type": "module" }\n' > package.json
printf 'node_modules\n' > .gitignore
git add package.json .gitignore
git commit -q -m "base"
mkdir -p src tests docs
cat > src/clamp.js <<'JS'
export function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
JS
cat > tests/clamp.test.mjs <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../src/clamp.js';

test('clamp below the range returns lo', () => assert.equal(clamp(-1, 0, 10), 0));
test('clamp above the range returns hi', () => assert.equal(clamp(11, 0, 10), 10));
test('clamp inside the range returns n', () => assert.equal(clamp(5, 0, 10), 5));
test('clamp on the low edge returns lo', () => assert.equal(clamp(0, 0, 10), 0));
test('clamp on the high edge returns hi', () => assert.equal(clamp(10, 0, 10), 10));
JS
git add src tests
git commit -q -m "feat: add clamp (T1)"
cat > docs/BRIEF.md <<'MD'
ID / title: T1 - clamp
Goal: src/clamp.js exports clamp(n, lo, hi), which returns n limited to the range lo..hi.
Context: spec scenario S1.
Files it may touch: src/clamp.js, tests/clamp.test.mjs
Tests that must pass: node --test tests/clamp.test.mjs
Acceptance: S1
Risk area: none
Deletion rules: none
Level: full
Skills: none
Base commit: the commit "base" (HEAD~1)
Mutants:
  M1: in src/clamp.js, change `if (n < lo)` to `if (n <= lo)`.
  M2: in src/clamp.js, delete the line `if (n > hi) return hi;`.
MD
cat > docs/SPEC.md <<'MD'
### S1 - clamp limits a number to a range (@decided)

- Given: lo = 0 and hi = 10.
- When: clamp(-1, 0, 10), clamp(11, 0, 10), clamp(5, 0, 10), clamp(0, 0, 10) and clamp(10, 0, 10) run.
- Then: the results are 0, 10, 5, 0 and 10.
- Tool: node --test.
- Test: tests/clamp.test.mjs.
MD
cat > docs/EXECUTOR-REPORT.md <<'MD'
Status: done
Branch / commit: main @ HEAD feat: add clamp (T1)
Changes: src/clamp.js - clamp; tests/clamp.test.mjs - five tests
Tests failed first: node --test tests/clamp.test.mjs, exit 1, "Cannot find module '../src/clamp.js'" (ERR_MODULE_NOT_FOUND) before src/clamp.js existed; all five tests failed.
Verified: node --test tests/clamp.test.mjs, exit 0, "tests 5, pass 5, fail 0".
Not verified: none
Found outside the spec: none
Questions for the Architect: none
MD
