#!/usr/bin/env bash
# usage: run.sh <arm: both|core> <n>
L="$(cd "$(dirname "$0")" && pwd)"
arm=$1; n=$2
if [ -n "$P_REUSE" ]; then P="$P_REUSE"; else P=$(mktemp -d); echo "$P" >> "$L/projects.txt"
git -C "$P" init -q; mkdir "$P/.guilda"; printf '.hooks-live.json\n' > "$P/.guilda/.gitignore"
git -C "$P" add .guilda/.gitignore; git -C "$P" -c user.name=lab -c user.email=lab@example.invalid commit -q -m init
fi
LOG="$L/logs/$arm-$n"; mkdir -p "$LOG"
STAMP="$LOG/stamp"; touch "$STAMP"
args=(--plugin-dir "$L/l4core")
[ "$arm" != core ] && [ "$arm" != stale ] && args+=(--plugin-dir "$L/l4ext")
t0=$(date +%s%3N)
( cd "$P" && L4_LOG="$LOG" L4_METHOD_B=1 timeout 300 claude "${args[@]}" -p "Reply with the single word OK." \
   --output-format stream-json --verbose --disallowedTools "Bash(claude plugin:*)" "Bash(gh:*)" > "$LOG/stream.jsonl" 2> "$LOG/stderr.txt" < /dev/null )
rc=$?; t1=$(date +%s%3N)
echo "{\"arm\":\"$arm\",\"n\":$n,\"rc\":$rc,\"wallMs\":$((t1-t0)),\"t0\":$t0}" > "$LOG/run.json"
( cd "$P" && git status --short --untracked-files=all ) > "$LOG/git-status.txt"
( cd "$P" && find . -path ./.git -prune -o -type f -print | sort ) > "$LOG/project-files.txt"
cat "$P/.guilda/.gitignore" > "$LOG/gitignore.txt"
find "$HOME/.claude" -newer "$STAMP" -type f 2>/dev/null | sed "s#$HOME#\$HOME#" > "$LOG/config-new-files.txt"
echo "$arm-$n rc=$rc wall=$((t1-t0))ms"
