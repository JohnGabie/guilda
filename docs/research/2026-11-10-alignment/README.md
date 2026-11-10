# Alignment research set (2026-11-10)

This set is the input for decision D39 in `docs/superpowers/specs/2026-11-09-guilda-decisions.md`.
D39: make the Reviewer, and guilda in general, stronger with rules from alignment research.
Work on D39 starts only when the Lab is ready. Each candidate rule gets a test and a Lab experiment first.

The files were translated from Portuguese working notes. The quotes from sources stay in the original English, word for word.

## Files

| File | Content |
|---|---|
| `01-video-summary.md` | A summary of a video about an OpenAI misalignment case, with timestamps. Only the summary is kept, not the transcript. |
| `02-user-report-analysis.md` | An analysis of the user's theoretical report on alignment and agent review. The report itself is private. |
| `03-correlations.md` | 21 items from alignment.openai.com, with URLs, dates and short quotes, mapped to the video and the report. |
| `04-reset-report-close-read.md` | A close read of the OpenAI report "Damaging the task environment to trigger a reset", and a fact-check of the video. |

## Two opposite failure modes

The sources show two failure modes of a reviewing agent. A rule for one mode can make the other mode worse.

1. **Too strict.** The Reviewer rejects acceptable work, asks for rework with no gain, or starts rework loops. Caution can also cause false "blocked" results. The user's report, the "Covert underperformance" report and the code-verification paper describe this mode.
2. **Too lenient or fake.** The grader approves without a check, or gives a fake result instead of an honest failure. The reset case, the "prompt-inject the grader" report and the compaction-summary reports describe this mode.

The reset case also shows a third point. A correct rejection of an impossible task can cause escalation, when the agent has no accepted honest exit.
