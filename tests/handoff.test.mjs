import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'queue');
const NOW = '2026-11-17T10:00:00.000Z';
const LATER = '2026-11-17T12:34:56.000Z';

function project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  for (const f of fs.readdirSync(FIXTURES)) fs.copyFileSync(path.join(FIXTURES, f), path.join(dir, f));
  return dir;
}

function q(dir, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const handoffText = (dir) => fs.readFileSync(path.join(dir, '.guilda', 'handoff.md'), 'utf8');

function queued() {
  const dir = project();
  assert.equal(q(dir, 'init', 'simple.plan.md', '--slots', '2', '--now', NOW).code, 0);
  assert.equal(q(dir, 'sync', '--now', NOW).code, 0);
  return dir;
}

test('the sections in order', () => {
  const dir = queued();
  const r = q(dir, 'handoff', '--now', LATER);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), 'handoff: .guilda/handoff.md');
  const text = handoffText(dir);
  const heads = text.split('\n').filter((l) => /^#{1,2} /.test(l));
  assert.deepEqual(heads, ['# Handoff', '## State', '## Tasks', '## Next', '## Notes', '## Rules']);
  assert.ok(text.includes('Read the core rules and .guilda/rules.md; this file holds no rule text.'));
  assert.ok(text.split('\n')[2].startsWith('written: ') || text.split('\n')[1].startsWith('written: '));
  assert.equal(fs.readdirSync(path.join(dir, '.guilda')).filter((f) => f.endsWith('.tmp')).length, 0);
});

test('the written line comes from --now', () => {
  const dir = queued();
  assert.equal(q(dir, 'handoff', '--now', LATER).code, 0);
  assert.ok(handoffText(dir).split('\n').includes(`written: ${LATER}`));
});

test('two notes keep their order', () => {
  const dir = queued();
  assert.equal(q(dir, 'handoff', '--note', 'first point', '--note', 'second point', '--now', NOW).code, 0);
  const text = handoffText(dir);
  const a = text.indexOf('- first point');
  const b = text.indexOf('- second point');
  assert.ok(a > 0 && b > a);
  assert.ok(a > text.indexOf('## Notes') && b < text.indexOf('## Rules'));
});

test('no note prints none', () => {
  const dir = queued();
  assert.equal(q(dir, 'handoff', '--now', NOW).code, 0);
  const text = handoffText(dir);
  assert.match(text.slice(text.indexOf('## Notes'), text.indexOf('## Rules')), /\nnone\n/);
});

test('a long note is cut', () => {
  const dir = queued();
  assert.equal(q(dir, 'handoff', '--note', `${'x'.repeat(400)}\nnext line`, '--now', NOW).code, 0);
  const text = handoffText(dir);
  const notes = text.slice(text.indexOf('## Notes'), text.indexOf('## Rules')).split('\n').filter((l) => l.startsWith('- '));
  assert.equal(notes.length, 1);
  assert.equal(notes[0], `- ${'x'.repeat(300)}`);
});

test('no queue exits 1', () => {
  const dir = project();
  const r = q(dir, 'handoff', '--now', NOW);
  assert.equal(r.code, 1);
  assert.equal(r.out.trim(), 'handoff: no queue yet');
  assert.equal(fs.existsSync(path.join(dir, '.guilda', 'handoff.md')), false);
});

test('a held task shows its reason', () => {
  const dir = queued();
  const tasks = JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'queue', 'state.json'), 'utf8')).tasks;
  const ready = Object.keys(tasks).find((id) => tasks[id].state === 'ready');
  assert.ok(ready);
  assert.equal(q(dir, 'hold', ready, '--now', NOW).code, 0);
  assert.equal(q(dir, 'handoff', '--now', NOW).code, 0);
  const text = handoffText(dir);
  const next = text.slice(text.indexOf('## Next'), text.indexOf('## Notes'));
  assert.match(next, new RegExp(`${ready}.*held.*hold`));
});
