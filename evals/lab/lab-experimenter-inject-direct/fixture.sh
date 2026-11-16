#!/usr/bin/env bash
# Fixture for the case lab-experimenter-inject-direct.
set -eu
printf "#!/usr/bin/env bash\nexit 4\n" > check.sh
chmod +x check.sh
printf "keep me\n" > keep.txt
