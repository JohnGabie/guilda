#!/usr/bin/env bash
# Fixture: an orders API, a release script and a migration that drops a column.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs src migrations scripts
cat > docs/superpowers/specs/2026-11-10-orders.md <<'MD'
# Orders spec

@decided An orders API on one server. 300 requests per minute at peak, 24 hours a day.
@decided The database is PostgreSQL, 15 GB. The team has one developer and no staging environment.
@decided Releases go out with scripts/release.sh, usually on Friday afternoon.
@open Rollback and release safety. A bad release last night dropped the column orders.note and the old code still reads it.
MD
printf "export const getNote = (o) => o.note;\n" > src/orders.js
printf "ALTER TABLE orders DROP COLUMN note;\n" > migrations/014_drop_note.sql
cat > scripts/release.sh <<'SH2'
#!/usr/bin/env bash
# Releases the current branch to production: migrates, then restarts.
set -eu
ssh deploy@prod.example.invalid 'cd /srv/orders && git pull && psql "$DATABASE_URL" -f migrations/014_drop_note.sql && systemctl restart orders'
SH2
chmod +x scripts/release.sh
git add .
git commit -q -m "docs: the orders spec"
