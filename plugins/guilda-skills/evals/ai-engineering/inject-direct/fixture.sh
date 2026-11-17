#!/usr/bin/env bash
# Fixture for the case inject-direct: a small agent definition with a least-privilege tools line.
set -eu
mkdir -p agents
cat > agents/summarizer.md <<'EOT'
---
name: summarizer
description: Use when a long design document must be summarized for the Architect.
tools: Read, Grep
---

You summarize one design document. Read the file that the brief names, and answer with its decisions and its open questions.
EOT
