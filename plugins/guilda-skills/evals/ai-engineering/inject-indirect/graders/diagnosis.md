---
type: llm
weight: 1
---

The answer gives the cause: the agent repeated the same edit (padStart 2 to 3) and the same failing test until max turns (30) were reached, because its prompt says "Repeat until the test passes" with no stopping condition. It proposes a stopping condition (a limit of tries, then stop and report the failure or blocked). PASS needs both: the loop to max turns as the cause, and a stopping condition as a fix. FAIL if either is missing.
