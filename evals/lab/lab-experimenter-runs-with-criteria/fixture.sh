#!/usr/bin/env bash
# Fixture for the case lab-experimenter-runs-with-criteria.
set -eu
printf "#!/usr/bin/env bash\necho CHECK-OK\nexit 0\n" > check.sh
chmod +x check.sh
