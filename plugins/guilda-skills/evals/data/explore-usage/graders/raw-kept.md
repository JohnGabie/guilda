---
type: llm
weight: 1
---

The raw file logs/usage.csv is not changed: no Write or Edit of it and no Bash command that writes to it (sed -i, a redirection to it, mv or rm of it). Any cleaning goes to a separate file or happens in memory, and the answer names which records it excluded and why. FAIL if the raw file was changed, or the excluded records are not named.
