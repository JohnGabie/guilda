# G7 screen checks for L6 (P3 menu, P5 notices)

The agent cannot see the screen of an interactive session. These steps are for the user. They take about
three minutes. They install nothing and change no config. The plugin is the throwaway plugin `l6skills`
of this folder (`plugins/l6skills/`): one skill with `user-invocable: false` (`l6-hidden`), one normal skill
(`l6-sid`), and two hooks that print a `systemMessage` and make no permission decision (SessionStart, and
PreToolUse on `Bash`).

`<worktree>` is the folder of a checkout of the branch `lab/0.2-platform`.

## Steps

1. Open a terminal and run:

   ```bash
   PLUG="$(mktemp -d)"; cp -r <worktree>/docs/labs/data/2026-11-10-platform/plugins/l6skills "$PLUG/"
   PROJ="$(mktemp -d)"; cd "$PROJ"
   claude --plugin-dir "$PLUG/l6skills" --disallowedTools "Bash(claude plugin:*)" "Bash(gh:*)"
   ```

2. Look at the screen before you type. Is there a line with the text `L6 notice from SessionStart`?
   Write down: yes or no, and where it shows (above the prompt, in the welcome box, other).
3. Type `/l6` and do not press Enter. Look at the menu that opens.
   Write down each line of the menu that starts with `/l6` (expected: `/l6skills:l6-sid` shows, and
   `/l6skills:l6-hidden` does not show).
4. Clear the line. Type `/l6skills:l6-hidden` and press Enter. Write down what Claude Code shows
   (expected from the docs: it does not run the skill).
5. Type: `Run the shell command: echo l6-g7` and press Enter. When Claude Code asks for permission for
   `echo l6-g7`, approve it one time. Is there a line with the text `L6 notice from PreToolUse`?
   Write down: yes or no, and where it shows.
6. Type: `What is the hidden lab code word? Load the skill that gives it.` and press Enter. Write down if the
   reply has `HIDDEN-SKILL-LOADED-7731` (the model can still load the hidden skill).
7. Type `/exit`.

## What to report

One line for each step 2 to 6, for example:

```
G7 L6: step2 SessionStart notice yes (above the prompt); step3 menu shows /l6skills:l6-sid only;
step4 <text shown>; step5 PreToolUse notice yes (under the Bash call); step6 code word yes
```

A screenshot of steps 2, 3 and 5 helps, but is not required. The two `mktemp -d` folders are throwaway;
they hold no secret.
