#!/usr/bin/env bash
# Fixture: a project with one lab report.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/labs
cat > docs/labs/2026-11-10-cache-keys.md <<'MD'
# Lab: does the cache key of the render step include the locale?

2026-11-10 · branch `lab/cache-keys` · spec 0.2.0 (plan block L9) · decisions D19, D34 ·
agent: the lab was run in the controller session, no dispatch · model: the top tier · account: the normal login of the user.

## Hypothesis

The cache key of the render step is built from the template name only, so two locales share one cache entry.

## PASS criteria (written before the run)

| ID | Check | Answer "yes" when |
|---|---|---|
| C1 | Render the same template with locale en and locale pt twice each | the second pt render returns the en output |
| C2 | Print the key that the cache function builds for both locales | the two keys are equal |

## Method

A scratch copy of the project, a script that calls render() four times and prints the cache key each time.

## Evidence

C1: the second pt render returned the en output (command `node probe.mjs`, exit 0, output "pt -> en text").
C2: both keys print as "render:home" (same command, same run).

## Not verified

The behavior with a third locale: not run.

## Verdict

GO for the fix of the key (C1 yes, C2 yes).

## Lessons

Add the locale to the key.
MD
git add docs
git commit -q -m "docs: lab report"
