#!/usr/bin/env bash
# Fixture: a small spec and a plan; task T2 uses a skill with no plan line.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs
cat > docs/superpowers/specs/GLOSSARY.md <<'MD'
# Glossary

| Term | Meaning | Forbidden synonyms |
|---|---|---|
| greeting | the text that the page shows to a user who just logged in | welcome text, hello banner |
MD
cat > docs/superpowers/specs/2026-11-10-greeting.md <<'MD'
# Greeting page

### Greeting text (@decided)

- Given: the user name "Ana".
- When: greet("Ana") runs.
- Then: it returns the exact string "Hello, Ana".
- Tool: node --test.
- Test: tests/greeting.test.mjs.

### Greeting style (@decided)

- Given: the element with id "greeting" and the greeting "Hello, Ana", at 1280 px width.
- When: the page renders.
- Then: the computed font-size of the element is 24px and its computed color is rgb(26, 26, 26).
- Tool: the browser, reading the computed style.
- Test: the QA scenario 2.
MD
cat > docs/superpowers/specs/2026-11-10-greeting.plan.md <<'MD'
# Greeting plan

Spec: docs/superpowers/specs/2026-11-10-greeting.md. All decisions below are @decided; each has one owner task.

## Skills

- Skill use: `test-driven-development` in T1. When: before the first line of the greeting function. Who: the Executor of T1. Where: tests/greeting.test.mjs and src/greeting.js. What: write the failing test first, then the code, as the skill describes.

## Traceability

| Decision | Owner task |
|---|---|
| Greeting text | T1 |
| Greeting style | T2 |

## Tasks

### T1 - the greeting text
Goal: src/greeting.js returns "Hello, <name>".
Files it may touch: src/greeting.js, tests/greeting.test.mjs
Skills: test-driven-development
Risk area: none

### T2 - the greeting style
Goal: the element with id "greeting" has font-size 24px and color #1a1a1a.
Files it may touch: src/page.css
Skills: frontend-design
Risk area: none
MD
git add docs
git commit -q -m "docs: spec and plan"
