# Lab: <question>

Date: <YYYY-MM-DD> · Branch: <lab branch> · Spec: <spec path> · Decisions: <decision IDs> · Agent ID: <agent ID of the agent that ran the lab> · Model: <model> · Account: <account note>

## Hypothesis

<One paragraph. What you expect, and why it would matter.>

## PASS criteria (written before the run)

| Check ID | What is measured | PASS when |
|---|---|---|
| C1 | <main metric> | <threshold> |
| G1 | <guard metric> | <threshold> |

Smallest effect worth acting on: <value>
Number of runs: <n>
Stop rule for the token use: <rule>

## Method

<The arms, the fixture, the key, the order, and the isolation of each attempt.>

## Evidence

### C1

Raw data: <path> · Command: <command> · Commit: <short SHA> · Date: <date>
Median: <value> · Mean: <value> · Interval: <value, when there are runs>

## Not verified

- <Each check that did not run, with the reason.>

## Verdict

<GO | conditional GO | NO-GO | MORE DATA>

- Cost of a wrong call: <text>
- Can be undone: <yes | no, and how>
- Does not apply to: <text>

## Lessons

- <Each change to the spec that the lab suggests.>

<!-- Form adapted from skills/diagnosing-superpowers/templates/report.md of superpowers 7.0.0 (MIT). -->
