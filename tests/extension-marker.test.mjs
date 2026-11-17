import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const EXT = path.join(REPO_ROOT, 'plugins', 'guilda-skills');
const SCRIPT = path.join(EXT, 'scripts', 'extension-marker.mjs');
const runMarker = (dir, input, env = { CLAUDE_PROJECT_DIR: dir }) =>
  spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', ...env },
  });

test('the hook writes the marker and nothing else', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const before = fs.readdirSync(path.join(dir, '.guilda')).sort();
  const r = runMarker(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: 's1', cwd: dir });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  const text = fs.readFileSync(path.join(dir, '.guilda', '.extension-live.json'), 'utf8');
  assert.ok(text.endsWith('\n'));
  const m = JSON.parse(text);
  assert.deepEqual(Object.keys(m).sort(), ['at', 'sessionId']);
  assert.equal(m.sessionId, 's1');
  assert.equal(new Date(m.at).toISOString(), m.at);
  const after = fs.readdirSync(path.join(dir, '.guilda')).sort();
  assert.deepEqual(after, [...before, '.extension-live.json'].sort());
});

test('the project is the cwd of the input when CLAUDE_PROJECT_DIR is empty', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  runMarker(dir, { session_id: 's2', cwd: dir }, {});
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.guilda', '.extension-live.json'), 'utf8')).sessionId, 's2');
});

test('with no .guilda folder it writes nothing', () => {
  const dir = tempProject();
  const r = runMarker(dir, { session_id: 's1', cwd: dir });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('hooks.json has one SessionStart entry for the marker script', () => {
  const h = JSON.parse(fs.readFileSync(path.join(EXT, 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(h.hooks.SessionStart.length, 1);
  assert.equal(h.hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
  assert.equal(h.hooks.SessionStart[0].hooks.length, 1);
  const c = h.hooks.SessionStart[0].hooks[0];
  assert.equal(c.type, 'command');
  assert.ok(`${c.command} ${(c.args ?? []).join(' ')}`.includes('${CLAUDE_PLUGIN_ROOT}/scripts/extension-marker.mjs'));
  assert.deepEqual(Object.keys(h.hooks), ['SessionStart']);
});
