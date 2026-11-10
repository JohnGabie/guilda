// Usage: node prompt.mjs <arm 1|2> <Q-id|R>  -> prints the agent prompt.
import fs from 'node:fs';
const { questions, review } = JSON.parse(fs.readFileSync(new URL('./questions.json', import.meta.url)));
const [arm, id] = process.argv.slice(2);
const item = id === 'R' ? review : questions.find((q) => q.id === id);
const files = 'The spec is `docs/superpowers/specs/2026-11-09-guilda-0.2-design.md`. The plan is ' +
  '`docs/superpowers/plans/2026-11-09-guilda-0.2-trace.md`. The briefs are in `docs/superpowers/briefs/`.';
const tools = arm === '1'
  ? 'Use grep and read as you like.'
  : 'Use grep and read as you like. An index exists: run `node labs/trace-index/show.mjs <ID>` to print one block ' +
    '(it also lists the owner task and the citing briefs), or read `.guilda/trace/index.json` and Read only that ' +
    'line range. Read by ID, never the whole spec file.' +
    (id === 'R' ? ' Run `node labs/trace-index/check.mjs` to list the suspect links, with each block as it was when the brief was written and as it is now.' : '');
const end = id === 'R' ? review.end : 'End your reply with one line that starts with `ANSWER:` and gives the short answer.';
console.log([
  `You are the ${item.role} of a guilda project. The project root is the current folder.`,
  files,
  `Question: ${item.q}`,
  tools,
  'Do not edit any file.',
  end,
].join('\n'));
