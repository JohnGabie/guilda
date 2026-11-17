import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills/architect/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

/** Text of one numbered procedure step, up to the next numbered step or the next heading. */
function step(n) {
  const lines = SKILL.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${n}. `));
  assert.ok(start >= 0, `procedure step ${n} exists`);
  const out = [lines[start]];
  for (const l of lines.slice(start + 1)) {
    if (/^\d+\. /.test(l) || l.startsWith('#')) break;
    out.push(l);
  }
  return out.join('\n');
}

/** Text of a `## <title>` section. */
function section(title) {
  const lines = SKILL.split('\n');
  const start = lines.indexOf(`## ${title}`);
  assert.ok(start >= 0, `section ${title} exists`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** One paragraph of a section: the lines from the one that starts with `<label>` up to the next blank line. */
function paragraph(text, label) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(label));
  assert.ok(start >= 0, `paragraph ${label} exists`);
  const rest = lines.slice(start);
  const end = rest.findIndex((l) => l.trim() === '');
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

const has = (text, sentence) => assert.ok(text.includes(sentence), `missing: ${sentence}`);

test('step 1: the plan step gives Uses, Owns and Covers lines, reads by ID and reads the budget', () => {
  const plan = step(9);
  has(plan, 'Give each plan task its `Uses:` and `Owns:` lines (R31).');
  has(plan, 'Give each plan one `Covers:` line with the spec items that it builds.');
  has(plan, 'Read a block with `node <plugin root>/scripts/trace.mjs <project> show <key>`.');
  has(plan, 'Never read the whole spec for one ID.');
  has(plan, 'call `get_budget`, `estimate_task` and `fits` in this step and before each wave (X10).');
  has(plan, '`slow_down` lowers the number of agents at the same time and keeps at least 1.');
  has(plan, '`unknown` is not zero: the plan pace applies.');
  has(plan, 'The budget limits the planned work and never creates work.');
  has(step(10), 'The `Context:` line of each brief names `trace.mjs <project> show <key>` for each block that the brief cites.');
});

test('step 2: the start of a build runs queue.mjs init with the session ID', () => {
  const s = paragraph(section('Queue and trace'), 'Start of a build');
  has(s, '`node <plugin root>/scripts/queue.mjs <project> init <plan file> --slots <n> [--part <N>] --session <id>`');
  has(s, 'The `<id>` is the ID of the context line `guilda session: <id>`.');
});

test('step 3: the checks run before each dispatch, and only a ready task gets an address', () => {
  has(step(11), 'Before each dispatch, run `trace.mjs <project> check` and `queue.mjs sync` (D14, D27).');
  const s = paragraph(section('Queue and trace'), 'Before each dispatch');
  has(s, 'Before each dispatch, run `trace.mjs <project> check` and `queue.mjs sync` (D14, D27).');
  has(s, 'Read each `SUSPECT` change before the dispatch.');
  has(s, 'Dispatch only a `ready` task.');
  has(s, '`queue.mjs <project> dispatch <task> --role <code> --tool <tool> --tier <tier> --session <id>`');
  has(s, 'Put the line `Address: <address>` of its output in the dispatch prompt.');
  has(s, 'A check run of the Reviewer, QA or Security also gets `--check`.');
});

test('step 4: each record_task line of a sync becomes one record_task call', () => {
  const s = paragraph(section('Queue and trace'), 'Record each run');
  has(s, 'After each `sync` that prints `record_task` lines, call `record_task` one time for each line, with the JSON of the line as the input.');
  has(s, 'Call it only when the session has the `cswap` tools (X10).');
  has(s, 'A failed call stops no work.');
});

test('step 5: a question of the Reviewer goes to the Executor with SendMessage and into the ledger', () => {
  const s = section('Review verdicts');
  has(s, 'Send each question of a `Questions:` section to the Executor with `SendMessage` and the agent ID of the attempt.');
  has(s, 'Add each question and each answer to the ledger.');
  has(s, 'If the user stopped the agent, answer from the transcript and the diff, with the mark `answered by the Architect`.');
});

test('step 6: the end of a build writes the prices file, runs cost.mjs and gives the records to the data skill', () => {
  const s = paragraph(section('Queue and trace'), 'End of a build');
  has(s, 'Read the official price page of each model provider and the PTAX rate of the Banco Central do Brasil on the record day.');
  has(s, 'Never write a price from memory (ARC5).');
  has(s, '`node <plugin root>/scripts/cost.mjs <project> --prices <file> [--work <work ID>] [--session <transcript> --analyzer <path>]`');
  has(s, 'Give the records of `.guilda/costs/` to the data skill.');
  has(s, '"usdPerMTok": true');
  has(s, 'https://platform.claude.com/docs/en/about-claude/pricing');
});

test('step 7: a named agent gets status.mjs --agent and a lab-reader with the session analysts', () => {
  const s = paragraph(section('Queue and trace'), 'A named agent');
  has(s, '`node <plugin root>/scripts/status.mjs <project> --agent <name>`');
  has(s, 'Then dispatch a `guilda:lab-reader` with the session analysts of `superpowers` on the transcript paths of the facts.');
  for (const a of ['stumbles', 'quality-evidence', 'request-conflicts', 'skill-timeline', 'cost-and-time', 'similar-session']) {
    has(s, `\`${a}\``);
  }
  has(s, 'A rule change goes to the Architect. A user decision goes to the user (R12).');
});

test('the brief format has the Uses line', () => {
  const s = section('Brief format');
  // The template line holds sample values, because tests/architect-brief.test.mjs runs validateBrief on it.
  assert.ok(s.split('\n').includes('Uses: D14@0a1b2c3d, D27@1a2b3c4d'), 'the template has a Uses line with two items');
  has(s, '`Uses:` has the form `Uses: <key>@<hash>, ...`');
});
