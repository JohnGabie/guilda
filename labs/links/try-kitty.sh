#!/usr/bin/env bash
# Usage: labs/links/try-kitty.sh [overlay|window|editor|handler] [ID]
# Opens a new kitty window with a test config and shows the links of show-links.mjs (formats A to K) in it.
# The test config is the normal kitty config of the user plus one open-actions file from labs/links/kitty.
# It lives in a temporary directory (KITTY_CONFIG_DIRECTORY) for this run only. The normal config does not change.
set -euo pipefail

mode="${1:-overlay}"
id="${2:-D14}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
actions="$here/kitty/open-actions.$mode.conf"
if [[ ! -f "$actions" ]]; then
  echo "unknown mode: $mode (use overlay, window, editor or handler)" >&2
  exit 2
fi

dir="$(mktemp -d "${TMPDIR:-/tmp}/guilda-links-kitty.XXXXXX")"
cleanup() { rm -- "$dir/kitty.conf" "$dir/open-actions.conf" 2>/dev/null || true; rmdir -- "$dir" 2>/dev/null || true; }
trap cleanup EXIT

cp -- "$here/kitty/kitty.conf" "$dir/kitty.conf"
handler="$here/open-at-line.mjs"
sed "s|@HANDLER@|${handler//|/\\|}|g" -- "$actions" > "$dir/open-actions.conf"

echo "Mode: $mode. Config directory for this run: $dir"
echo "Click the links J and K in the new window (a plain click; Shift+click if a program grabs the mouse)."
KITTY_CONFIG_DIRECTORY="$dir" kitty --title "guilda links lab ($mode)" --hold node "$here/show-links.mjs" "$id"
