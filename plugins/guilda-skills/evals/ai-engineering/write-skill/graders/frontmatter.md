---
type: regex
target: { source: file, path: plugin/skills/release-notes/SKILL.md }
pattern: '^-{3}\n(?:[^\n]*\n)*?name: release-notes\n(?:[^\n]*\n)*?description: [^\n]*\bUse when\b'
match: contains
weight: 1
---

The frontmatter has the name release-notes and a description that says when to use it ("Use when").
