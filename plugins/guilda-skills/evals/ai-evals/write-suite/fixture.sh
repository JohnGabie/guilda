#!/usr/bin/env bash
# Fixture for the case write-suite: a small plugin with one skill that has no eval suite yet.
set -eu
mkdir -p plugin/.claude-plugin plugin/skills/changelog
cat > plugin/.claude-plugin/plugin.json <<'EOT'
{ "name": "release-kit", "version": "0.1.0", "description": "Release helpers." }
EOT
cat > plugin/skills/changelog/SKILL.md <<'EOT'
---
name: changelog
description: Use when the user asks for a changelog entry for a release, from the commit messages since the last tag.
---

# Changelog

1. Read the commit messages since the last tag (the user pastes them, or they are in a file that the user names).
2. Group them under Added, Changed and Fixed. Drop merge commits.
3. Write the entry at the top of CHANGELOG.md, under a heading with the version and the date.
4. Do not change any other file.
EOT
