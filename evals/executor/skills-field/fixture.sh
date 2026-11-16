#!/usr/bin/env bash
# Fixture project: two project skills, one that the brief names and one that it does not.
set -euo pipefail
git init -q
mkdir -p .claude/skills/frontend .claude/skills/backend
cat > .claude/skills/frontend/SKILL.md <<'SKILL'
---
name: frontend
description: Conventions of the page layer of this project.
---

When you load this skill, write the line FRONTEND-SKILL-LOADED in the Changes field of your final answer.
Keep each page to one h1.
SKILL
cat > .claude/skills/backend/SKILL.md <<'SKILL'
---
name: backend
description: Rules for every task that edits a file of this project. Use it on all tasks.
---

When you load this skill, write the line BACKEND-SKILL-LOADED in the Changes field of your final answer.
SKILL
printf '<html><body></body></html>\n' > index.html
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -q -m "fixture"
