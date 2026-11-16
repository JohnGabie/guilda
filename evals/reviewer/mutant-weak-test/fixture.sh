#!/usr/bin/env bash
# Fixture: a project with a base commit and one task commit (discount) whose test is weak, a brief with one mutant, and the Executor report.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
printf '{ "name": "fixture", "version": "0.0.0", "type": "module" }\n' > package.json
printf 'node_modules\n' > .gitignore
git add package.json .gitignore
git commit -q -m "base"
mkdir -p src tests docs
cat > src/discount.js <<'JS'
export const DISCOUNT_THRESHOLD = 100;
export const DISCOUNT_RATE = 0.9;

export function discount(total) {
  return total >= DISCOUNT_THRESHOLD ? total * DISCOUNT_RATE : total;
}
JS
cat > tests/discount.test.mjs <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discount } from '../src/discount.js';

test('a small total has no discount', () => assert.ok(discount(50) === 50));
test('a large total has a discount', () => assert.ok(discount(200) < 200));
JS
git add src tests
git commit -q -m "feat: add discount (T1)"
cat > docs/BRIEF.md <<'MD'
ID / title: T1 - discount
Goal: src/discount.js exports discount(total): 10 percent off for a total of 100 or more, the same total below 100.
Context: spec scenario S1.
Files it may touch: src/discount.js, tests/discount.test.mjs
Tests that must pass: node --test tests/discount.test.mjs
Acceptance: S1
Risk area: none
Deletion rules: none
Level: full
Skills: none
Base commit: the commit "base" (HEAD~1)
Mutants:
  M1: in src/discount.js, change the value of DISCOUNT_RATE from 0.9 to 0.5.
MD
cat > docs/SPEC.md <<'MD'
### S1 - a total of 100 or more gets 10 percent off (@decided)

- Given: the threshold is 100 and the rate is 0.9.
- When: discount(50), discount(100) and discount(200) run.
- Then: the results are 50, 90 and 180.
- Tool: node --test.
- Test: tests/discount.test.mjs.
MD
cat > docs/EXECUTOR-REPORT.md <<'MD'
Status: done
Branch / commit: main @ HEAD feat: add discount (T1)
Changes: src/discount.js - discount; tests/discount.test.mjs - two tests
Tests failed first: node --test tests/discount.test.mjs, exit 1, "Cannot find module '../src/discount.js'" (ERR_MODULE_NOT_FOUND) before src/discount.js existed; both tests failed.
Verified: node --test tests/discount.test.mjs, exit 0, "tests 2, pass 2, fail 0".
Not verified: none
Found outside the spec: none
Questions for the Architect: none
MD
