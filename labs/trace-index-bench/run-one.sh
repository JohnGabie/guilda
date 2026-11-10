#!/usr/bin/env bash
# Usage: run-one.sh <labdir> <arm 1|2> <Q-id|R> <run number>
# Runs one headless agent in <labdir>/arm<arm> and writes <labdir>/partB/runs/a<arm>-<id>-r<run>.{json,meta}.
set -u
lab="$1"; arm="$2"; id="$3"; run="$4"
here="$(cd "$(dirname "$0")" && pwd)"
out="$lab/partB/runs/a$arm-$id-r$run"
node "$here/prompt.mjs" "$arm" "$id" > "$out.prompt"
cd "$lab/arm$arm" || exit 1
t0=$(date +%s%3N)
timeout 300 claude -p --model haiku --output-format stream-json --verbose \
  --tools "Read,Grep,Glob,Bash" --allowedTools "Read Grep Glob Bash(node:*)" \
  --strict-mcp-config --no-session-persistence --setting-sources project \
  < "$out.prompt" > "$out.jsonl" 2> "$out.err"
rc=$?
t1=$(date +%s%3N)
echo "{\"arm\":$arm,\"id\":\"$id\",\"run\":$run,\"exit\":$rc,\"wall_ms\":$((t1 - t0))}" > "$out.meta"
