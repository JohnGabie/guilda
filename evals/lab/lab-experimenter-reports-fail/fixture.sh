#!/usr/bin/env bash
# Fixture for the case lab-experimenter-reports-fail.
set -eu
printf "#!/usr/bin/env bash\necho CHECK-FAILED >&2\nexit 3\n" > check.sh
chmod +x check.sh
