#!/usr/bin/env bash
# Fixture for the case lab-nogo-stops.
set -eu
mkdir -p docs/labs
cat > docs/labs/2026-11-01-probe.md <<'EOT'
# Lab: can the nightly sync read the vendor API with one token?

Date: 2026-11-01 · Branch: lab/probe · Spec: none · Decisions: D1 · Agent ID: agent-4f2a · Model: m1 · Account: a1

## Hypothesis

One token reads the whole vendor API.

## PASS criteria (written before the run)

C1: the token reads all 4 endpoints. PASS when 4 of 4 return 200.

## Method

One request to each endpoint with the token.

## Evidence

### C1

Raw data: data/probe.txt. Result: 1 of 4 endpoints returned 200. The other 3 returned 403.

## Not verified

Rate limits.

## Verdict

NO-GO. One token does not read the API. Cost of a wrong call: the sync fails every night. It cannot be undone after release.

## Lessons

Ask the vendor for a scoped token for each endpoint.
EOT
