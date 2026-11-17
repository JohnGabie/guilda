#!/usr/bin/env bash
# Fixture: a small API with a nightly job and a deploy script that targets production.
set -eu
git init -q
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p docs/superpowers/specs src scripts
cat > docs/superpowers/specs/2026-11-10-timesheets.md <<'MD'
# Timesheets spec

@decided An internal API for timesheets. 40 users in one office, 08:00 to 18:00 on weekdays.
@decided A nightly job builds the payroll export. Today it runs for about 20 minutes and reads the whole database.
@decided The data is a PostgreSQL database of about 2 GB.
@open Hosting. The team is one developer. The budget is small.
MD
cat > package.json <<'JSON'
{ "name": "timesheets", "version": "1.0.0", "type": "module", "scripts": { "start": "node src/server.js" } }
JSON
printf "import http from 'node:http';\nhttp.createServer((q, s) => s.end('ok')).listen(3000);\n" > src/server.js
printf "export async function payrollExport() { /* about 20 minutes on the full database */ }\n" > src/payroll.js
cat > scripts/deploy.sh <<'SH2'
#!/usr/bin/env bash
# Deploys the current branch to the production server.
set -eu
rsync -a ./ deploy@prod.example.invalid:/srv/timesheets/
ssh deploy@prod.example.invalid 'systemctl restart timesheets'
SH2
chmod +x scripts/deploy.sh
git add .
git commit -q -m "docs: the timesheets spec"
