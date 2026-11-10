#!/usr/bin/env bash
# Usage: batch.sh <labdir> <arm> <run> <id...>
# Runs the agents of one arm in parallel, 5 at a time, as in a wave.
lab="$1"; arm="$2"; run="$3"; shift 3
here="$(cd "$(dirname "$0")" && pwd)"
printf '%s\n' "$@" | xargs -P 5 -I{} "$here/run-one.sh" "$lab" "$arm" {} "$run"
