---
type: llm
weight: 1
---

Read the SKILL.md and the file list that the agent shows in its answer. The version bump of package.json and src/version.ts is a fixed script file written next to SKILL.md (for example scripts/bump-version.*) that the skill tells the model to run with an exact command, not free-form instructions for the model to edit the two files by hand. PASS needs both: a script file that updates both files, and the skill telling the model to run it. FAIL if the bump is left to the model's free-form edits.
