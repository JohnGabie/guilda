#!/usr/bin/env bash
# Usage: run.sh <name> "<prompt>" <plugin dir>... — one live session in a new mktemp project.
set -u
LAB="$(cd "$(dirname "$0")" && pwd)"
name="$1"; prompt="$2"; shift 2
args=()
for p in "$@"; do args+=(--plugin-dir "$(realpath "$p")"); done
proj="$(mktemp -d -t l6-proj-XXXX)"
if [ -n "${L6_SETUP:-}" ]; then (cd "$proj" && bash -c "$L6_SETUP"); fi
echo "$proj" > "$LAB/runs/$name.project"
start=$(date +%s%3N)
(cd "$proj" && timeout 300 claude "${args[@]}" -p "$prompt" --output-format stream-json --verbose \
  --disallowedTools "Bash(claude plugin:*)" "Bash(gh:*)" < /dev/null > "$LAB/runs/$name.jsonl" 2> "$LAB/runs/$name.err")
code=$?
end=$(date +%s%3N)
echo "{\"name\":\"$name\",\"exit\":$code,\"ms\":$((end-start))}" >> "$LAB/runs/index.jsonl"
echo "$name exit=$code ms=$((end-start))"
