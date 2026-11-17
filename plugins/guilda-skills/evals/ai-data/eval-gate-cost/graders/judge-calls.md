---
type: llm
weight: 1
---

The answer gives 144 judge calls for the full run: 3 calls x (4 cases x 2 llm graders) x 3 runs x 2 arms = 144. The two cases with only regex and tool_used graders add no judge call. For the skill-arm-only run the right number is 72 (3 x 8 x 3 x 1); that number is correct there and is not an error. Judge only the full run: FAIL if the full run has a number of judge calls other than 144 (for example 72, 48, 36 or 216) or counts a judge call for the regex and tool_used graders.
