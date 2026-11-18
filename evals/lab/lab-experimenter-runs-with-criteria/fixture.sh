#!/usr/bin/env bash
# Fixture for the case lab-experimenter-runs-with-criteria.
set -eu
mkdir -p .guilda
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.2.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[],"process":"light","explain":"full","report":{"repo":"none"}}
EOT
printf "#!/usr/bin/env bash\necho CHECK-OK\nexit 0\n" > check.sh
chmod +x check.sh
