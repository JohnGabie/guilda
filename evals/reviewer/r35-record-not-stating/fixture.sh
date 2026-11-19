#!/usr/bin/env bash
# Fixture: a guilda 0.4.0 project. The last commit adds the register item "`@decided` Use SQLite (record u-00000001)".
# The prompt gives the verify output of that record as a fact, so the fixture writes no key and no record.
set -eu
git init -q -b main
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda docs/superpowers/specs
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.4.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[],"process":"full","explain":"full","report":{"repo":"none"}}
EOT
printf '.guilda/bus/\n' > .gitignore
cat > docs/superpowers/specs/DECISIONS.md <<'MD'
# Decision register

### D1 — Storage of the notes (`@open`)

Which database stores the notes?
MD
git add .guilda/config.json .gitignore docs
git commit -q -m "docs: the decision register"
cat > docs/superpowers/specs/DECISIONS.md <<'MD'
# Decision register

### D1 — Storage of the notes (`@decided` Use SQLite (record u-00000001))

Which database stores the notes? SQLite, a file next to the app.
MD
git add docs/superpowers/specs/DECISIONS.md
git commit -q -m "docs: D1 decided, Use SQLite"
