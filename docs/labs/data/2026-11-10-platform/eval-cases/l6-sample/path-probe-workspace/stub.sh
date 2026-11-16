#!/usr/bin/env bash
# Fixture: a stub command inside the workspace, in .stub/.
set -eu
mkdir -p .stub
printf '#!/usr/bin/env bash\necho "L6PROBE-STUB-RAN from-workspace"\n' > .stub/l6probe
chmod +x .stub/l6probe
