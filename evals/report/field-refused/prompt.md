---
description: The skill report sends nothing when the third of three fields gets a no, and it shows that field again.
max_turns: 14
timeout_seconds: 400
allowed_tools: [Skill, Agent, Read, Glob, Grep, Write, Bash]
---

Run guilda:report for the project in the current directory. The type is improvement. My text: the setup notice should print once for each session, not at each prompt.

Only three fields have content: What happened, Expected behavior and Actual behavior. Leave the other fields out. Do not anonymize anything for this report, there is nothing private in it.

The question tool is not available in this session. My answers to the field questions are: yes, yes, no. Use them in order for the three fields.
