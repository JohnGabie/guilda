#!/usr/bin/env bash
# Fixture for the case review-report.
set -eu
mkdir -p lab
cat > lab/report.md <<'EOT'
# Lab: can the project replace its hand-written CSV reader with the package fastcsv?

Date: 2026-11-12. Branch: lab/fastcsv. Decision: D20. Model: sonnet. Account note: personal.

## Hypothesis

fastcsv reads our 3 sample files at least as fast as the hand-written reader.

## PASS criteria (written 2026-11-12, after the first benchmark run of 2026-11-10)

| ID | Check | Limit |
|----|-------|-------|
| C1 | license is allowed | MIT or Apache-2.0 |
| C2 | the 3 sample files parse equal to today's output | 3 of 3 |
| C3 | speed on the 50 MB file | at most 10% slower than today's reader |
| C4 | no known important advisory | 0 |

## Method

Run on the main checkout of the project, in the working tree. The spike code was merged into main after the run, so
the next task can use it. Temporary files were removed with `rm -rf /tmp/fastcsv-lab`.

## Evidence

- C1: the license is MIT (from memory). The package has about 3 maintainers.
- C2: 3 of 3 sample files parsed equal (`node scripts/compare.js`, 2026-11-10).
- C4: no advisory found in the search that I did in the browser.

## Not verified

- C3: the benchmark on the 50 MB file did not run, the machine was busy.

## Verdict

GO. The package passes the checks. It can be adopted.

## Lessons

None.
EOT
