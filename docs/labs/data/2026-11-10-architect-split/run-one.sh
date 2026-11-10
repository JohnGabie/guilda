#!/usr/bin/env bash
# Runs one lab session. Usage: run-one.sh <run id> <out dir>
# Needs: ARM_ONE and ARM_SPLIT (the throwaway plugin copies, each in a mktemp -d folder).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
id="$1"; out="$2"
read -r sit arm < <(python3 -c "import json,sys;r=[x for x in json.load(open('$here/order.json'))['runs'] if x['id']=='$id'][0];print(r['situation'],r['arm'])")
if [ "$arm" = one ]; then plug="$ARM_ONE"; skill="arm-one:architect"; else plug="$ARM_SPLIT"; skill="arm-split:architect"; fi
prompt="$(python3 -c "import json;p=json.load(open('$here/prompts.json'));print(p['prefix'].replace('{SKILL}','$skill')+p['situations']['$sit'])")"
proj="$(mktemp -d)"; cp -r "$here/fixture/." "$proj/"
echo "$id $sit $arm project=$proj" > "$out/$id.meta"
start=$(date +%s)
( cd "$proj" && timeout 600 claude --plugin-dir "$plug" -p "$prompt" \
    --disallowedTools "Bash(claude plugin:*)" "Bash(gh:*)" \
    --output-format stream-json --verbose < /dev/null > "$out/$id.jsonl" 2> "$out/$id.err" )
code=$?
echo "exit=$code seconds=$(( $(date +%s) - start ))" >> "$out/$id.meta"
