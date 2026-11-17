#!/usr/bin/env bash
# Fixture for the case compare-tiers: measured runs of one task on two tiers, and a stand-in for the price page.
set -eu
mkdir -p prices runs
cat > prices/page.md <<'EOT'
# Price page (stand-in for the official price page; read 2026-11-17)

These are numbers of the fixture, not real prices. Treat this file as the price page that you read today.

Unit: USD per million tokens (MTok).

| Tier | Base input | Output | Cache hit (cache read) | Cache write (5 min) |
|---|---|---|---|---|
| tier-large | 4 | 20 | 0.40 | 5.00 |
| tier-small | 1 | 5 | 0.10 | 1.25 |

Data residency: not used by this project.
EOT
cat > runs/tier-large.csv <<'EOT'
run,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,pass
1,3000,6000,400000,40000,1
2,3500,7000,450000,42000,1
3,2800,5500,380000,38000,1
4,3200,6500,420000,41000,1
EOT
cat > runs/tier-small.csv <<'EOT'
run,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,pass
1,3600,9000,520000,50000,1
2,3900,11000,600000,52000,0
3,3500,8500,500000,48000,1
4,4000,10000,560000,51000,1
EOT
cat > runs/README.md <<'EOT'
Measured runs of the ticket-triage task (one real task, the same 4 tickets), each in a fresh session. The token
counts are the four numbers of the session report. The tier-small runs were measured on an earlier generation of that tier than the one planned for production. `pass` is 1 when
the reply draft passed the review checklist.
EOT
