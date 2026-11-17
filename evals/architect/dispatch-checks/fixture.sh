#!/usr/bin/env bash
# Fixture: a guilda 0.3.0 project with a queue of one work. T1 is ready and its Uses link D1@0941709c is suspect:
# a later spec commit added a Why line to D1. T2 is pending, because it depends on T1.
set -eu
git init -q -b main
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda/queue docs/superpowers/specs
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.3.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[{"name":"test","command":"node --test"}],"process":"full","explain":"brief","report":{"repo":"none"},"usage":{"source":"off"}}
EOT
printf '{ "name": "fixture", "version": "0.0.0", "type": "module" }\n' > package.json
printf '.guilda/trace/\n.guilda/work/\n.guilda/queue/\n.guilda/status.md\n' > .gitignore
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
Dependencies: none
Files it may touch: src/greeting.js, tests/greeting.test.mjs

### T2 — the farewell text
Uses: D2@b0b1a542
Owns: D2
Dependencies: T1
Files it may touch: src/farewell.js, tests/farewell.test.mjs
MD
git add .guilda/config.json package.json .gitignore docs
git commit -q -m "docs: spec and plan"
sed -i 's/^- Then: it returns the exact string "Hello, Ana"\.$/&\n- Why: the page greets the user after a login./' docs/superpowers/specs/2026-11-10-greeting.md
git commit -q -am "docs: D1 gets its reason"
cat > docs/T1-brief.md <<'MD'
ID / title: T1 — the greeting text
Goal: src/greeting.js exports greet(name), which returns "Hello, <name>".
Context: node <plugin root>/scripts/trace.mjs . show D1
Out of scope: the farewell text (T2).
Files it may touch: src/greeting.js, tests/greeting.test.mjs
Contract / interfaces: export function greet(name: string): string
Tests that must pass: node --test tests/greeting.test.mjs
Acceptance: D1, with node --test
Suggested tier: apprentice
Risk area: none
Deletion rules: none
Dependencies: none
Base commit: HEAD
Uses: D1@0941709c
MD
cat > .guilda/queue/journal.jsonl <<'JSONL'
{"seq":1,"t":"2026-11-17T10:00:00.000Z","type":"plan","plan":"docs/superpowers/specs/2026-11-10-greeting.plan.md","part":null,"work":"w-876f4649","slots":1}
{"seq":2,"t":"2026-11-17T10:00:00.000Z","type":"task","task":"T1","work":"w-876f4649","key":"2026-11-10-greeting.plan#T1","title":"the greeting text","deps":[],"uses":["D1@0941709c"],"owns":["D1"]}
{"seq":3,"t":"2026-11-17T10:00:00.000Z","type":"task","task":"T2","work":"w-876f4649","key":"2026-11-10-greeting.plan#T2","title":"the farewell text","deps":["T1"],"uses":["D2@b0b1a542"],"owns":["D2"]}
{"seq":4,"t":"2026-11-17T10:01:00.000Z","type":"state","task":"T1","from":"pending","to":"ready","cause":"deps-done"}
JSONL
cat > .guilda/queue/state.json <<'JSON'
{
  "generator": "guilda 0.2.0",
  "journalSeq": 4,
  "slots": 1,
  "works": {
    "w-876f4649": {
      "plan": "docs/superpowers/specs/2026-11-10-greeting.plan.md",
      "part": null
    }
  },
  "tasks": {
    "T1": {
      "work": "w-876f4649",
      "key": "2026-11-10-greeting.plan#T1",
      "state": "ready",
      "attempt": 1,
      "address": null,
      "agentId": null,
      "role": null,
      "tool": null,
      "inSession": null,
      "tier": null,
      "title": "the greeting text",
      "deps": [],
      "uses": [
        "D1@0941709c"
      ],
      "owns": [
        "D1"
      ],
      "since": "2026-11-17T10:01:00.000Z",
      "cause": "deps-done",
      "startedAt": null,
      "lastHeartbeat": null,
      "busyUntil": null,
      "tokens": null,
      "agentSeconds": 0,
      "checks": []
    },
    "T2": {
      "work": "w-876f4649",
      "key": "2026-11-10-greeting.plan#T2",
      "state": "pending",
      "attempt": 1,
      "address": null,
      "agentId": null,
      "role": null,
      "tool": null,
      "inSession": null,
      "tier": null,
      "title": "the farewell text",
      "deps": [
        "T1"
      ],
      "uses": [
        "D2@b0b1a542"
      ],
      "owns": [
        "D2"
      ],
      "since": "2026-11-17T10:00:00.000Z",
      "cause": null,
      "startedAt": null,
      "lastHeartbeat": null,
      "busyUntil": null,
      "tokens": null,
      "agentSeconds": 0,
      "checks": []
    }
  }
}
JSON
