---
type: llm
weight: 1
---

The answer lists which logs or metrics to read next (for example the database active connections, slow query log, or pool wait time) and says what each result would mean. It gives at least two options to fix it (for example a bigger pool, a connection pooler, a cache, a bigger machine) with a cost or trade-off for each, and one recommendation. Pass only if the checks have meanings and there are two or more options with a recommendation.
