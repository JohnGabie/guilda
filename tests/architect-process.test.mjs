import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills/architect/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

/** Count the exact sentence in the skill text, with line breaks folded to spaces. */
function count(sentence) {
  const flat = SKILL.replace(/\s*\n\s*/g, ' ');
  return flat.split(sentence).length - 1;
}

const SENTENCES = {
  T25: 'At the end of each wave, run queue.mjs handoff with a note for each open point. When your context is large, write the handoff and stop. A fresh controller starts from .guilda/handoff.md.',
  T26: 'Before you wait on an agent, run queue.mjs sync and read its branch. The done signal of the agent may be there before any notification.',
  T28: 'Report to the user only on a state change: a task integrated, a verdict, a blocker or a new decision.',
  T29: 'Put each decision that waits for the user in decisions.mjs add, and keep working on the rest. Ask the decisions in the question tool when the user comes back.',
  T30: 'Take each time that you write by hand from now.mjs; never write a time from memory.',
  T31: 'In a question, say each rule or decision in plain words first, then its ID in parentheses.',
};

for (const [id, sentence] of Object.entries(SENTENCES)) {
  test(`${id}: the skill has its sentence once`, () => {
    assert.equal(count(sentence), 1, sentence);
  });
}
