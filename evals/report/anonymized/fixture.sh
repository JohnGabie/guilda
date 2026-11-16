#!/usr/bin/env bash
# Fixture for the case anonymized. The project layer sets report.repo to "none", an invalid value,
# so report-send saves a report and sends nothing. A stub gh only records its arguments.
set -eu
mkdir -p .guilda bin src logs
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.2.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[],"process":"full","explain":"full","report":{"repo":"none"}}
EOT
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "${GH_STUB_LOG:-/dev/null}"\nexit 1\n' > bin/gh
chmod +x bin/gh
printf "# Quillfarm\nQuillfarm is an invoice tool of the Quillen Ledger company.\n" > README.md
printf "app.post('/api/v2/quillfarm-sync', (req, res) => res.sendStatus(500));\n" > src/server.js
