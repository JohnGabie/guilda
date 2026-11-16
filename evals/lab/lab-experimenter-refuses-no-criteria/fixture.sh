#!/usr/bin/env bash
# Fixture for the case lab-experimenter-refuses-no-criteria.
set -eu
printf "#!/usr/bin/env bash\necho CHECK-RAN\nexit 0\n" > check.sh
chmod +x check.sh
