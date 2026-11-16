#!/usr/bin/env bash
# Fixture for the case no-whole-file. The project layer sets report.repo to "none", an invalid value,
# so report-send saves a report and sends nothing. A stub gh only records its arguments.
set -eu
mkdir -p .guilda bin src logs
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.2.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[],"process":"full","explain":"full","report":{"repo":"none"}}
EOT
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "${GH_STUB_LOG:-/dev/null}"\nexit 1\n' > bin/gh
chmod +x bin/gh
printf "# Sample\nA small build tool.\n" > README.md
i=1
while [ "$i" -le 60 ]; do printf "export const step%s = (x) => x + %s;\n" "$i" "$i"; i=$((i+1)); done > src/steps.js
i=1
while [ "$i" -le 80 ]; do printf "2026-11-01T10:00:%02d build step %s ok\n" "$((i % 60))" "$i"; i=$((i+1)); done > logs/build.log
printf "2026-11-01T10:02:00 build step 81 FAILED: steps.js line 33 is not a function\n" >> logs/build.log
