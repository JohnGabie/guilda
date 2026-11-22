import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const TIERS = { master: 'opus', journeyman: 'sonnet', apprentice: 'haiku' };
const MODELS = {
  'architect-executor': 'opus', security: 'opus', 'lab-researcher': 'opus', 'lab-reader': 'opus',
  reviewer: 'opus', 'coherence-validator': 'opus', 'devops-advisor': 'opus', 'ai-lead': 'opus',
  'lab-experimenter': 'opus', executor: 'sonnet', qa: 'sonnet', 'version-control': 'sonnet',
  supervisor: 'sonnet', 'security-lead': 'opus',
};
const agentsDir = path.join(REPO_ROOT, 'agents');
const modelOf = (f) => (fs.readFileSync(path.join(agentsDir, f), 'utf8').match(/^model:\s*(\S+)\s*$/m) || [])[1];

test('core/tiers.json is as in 0.2.0', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'core', 'tiers.json'), 'utf8')), TIERS);
});

test('each agent model is as in 0.2.0', () => {
  for (const [name, model] of Object.entries(MODELS)) assert.equal(modelOf(`${name}.md`), model, name);
});

test('a new agent file needs a row', () => {
  const names = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  assert.deepEqual(names.sort(), Object.keys(MODELS).sort());
});
