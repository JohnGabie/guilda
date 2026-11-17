---
description: init offers ios-on-linux for a mobile project (S10).
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, Bash, Write]
---

Load the `guilda:init` skill and set up guilda for the project in the current folder.

My answers. Do not ask me anything else, and use these answers in place of the question tool.
- The process level: a product.
- The explain setting: brief.
- Replies and docs are in English. Use the default tiers. No writing exceptions. No extra roles.
- Fears: nothing must happen beyond what the code shows. No domain rules. No risk areas.
- Git flow: no autocommit, no pull request.
- Use the checks you can run yourself.
- Any offer or proposal that the skill makes: I accept it.

I approve the full proposal now. This shell is read-only, so write no file. Do not run `config-write.mjs`.
Instead, print these in your final reply, in this order: the answers JSON that you would pass to `config-write.mjs`; the proposal lines for `CLAUDE.md`, the glossary and any formatter ignore entry; each plugin offer; the plugin install commands for each missing plugin. Then stop.
