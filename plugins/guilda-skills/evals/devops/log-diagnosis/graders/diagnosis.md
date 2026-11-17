---
type: llm
weight: 1
---

The answer gives the symptom first (errors with status 500 and slow answers, from about 14:05) and then the cause: the deploy of version 2.3.1 at 14:02 changed `db_pool_size` from 20 to 5, and from 14:05 the pool was exhausted (in_use 5 of max 5, with a growing queue of waiting requests), so requests timed out acquiring a database connection. It says that traffic did not change (10 requests a minute before and after), so the cause is not a traffic spike. It says how sure it is, or names a gap or limit of the log. FAIL if the cause is another one (for example a traffic spike or a database outage), or if the symptom and the time are missing.
