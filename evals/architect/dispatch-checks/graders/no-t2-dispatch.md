---
type: regex
target: trace
pattern: '"name":"Agent","input":\{[^\n]*(ID / title: T2|Address: T2-)|"command":"(?:[^"\\]|\\.)*queue\.mjs(?:\\")?\s+\S+\s+dispatch\s+T2'
match: not_contains
weight: 1
---

T2 is pending, so the Architect neither dispatches T2 with the Agent tool nor runs `queue.mjs dispatch T2`.
