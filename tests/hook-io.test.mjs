import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './helpers.mjs';

const MODULE = pathToFileURL(path.join(REPO_ROOT, 'scripts', 'lib', 'hook-io.mjs')).href;

function runSnippet(body, { input = '', env = {} } = {}) {
  const code = `import * as io from ${JSON.stringify(MODULE)};\n${body}`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '', ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('readStdin parses a JSON object', () => {
  const r = runSnippet('console.log(JSON.stringify(await io.readStdin()));', { input: '{"a":1}' });
  assert.equal(r.stdout.trim(), '{"a":1}');
});

test('readStdin returns null for empty or invalid input', () => {
  for (const input of ['', '   ', '{ nope']) {
    const r = runSnippet('console.log(String(await io.readStdin()));', { input });
    assert.equal(r.stdout.trim(), 'null', JSON.stringify(input));
  }
});

test('resolveProjectDir prefers the environment, then input.cwd, then the cwd', () => {
  const body =
    'console.log([io.resolveProjectDir({cwd:"/b"}), io.resolveProjectDir({}) === process.cwd()].join("|"));';
  assert.equal(runSnippet(body, { env: { CLAUDE_PROJECT_DIR: '/a' } }).stdout.trim(), '/a|false');
  assert.equal(runSnippet(body).stdout.trim(), '/b|true');
});

test('resolvePluginRoot prefers the environment, else the repository root', () => {
  const r = runSnippet('console.log(io.resolvePluginRoot());', { env: { CLAUDE_PLUGIN_ROOT: '/p' } });
  assert.equal(r.stdout.trim(), '/p');
  const r2 = runSnippet('console.log(io.resolvePluginRoot());');
  assert.equal(path.resolve(r2.stdout.trim()), REPO_ROOT);
});

test('runHookMain passes the input and exits 0', () => {
  const r = runSnippet('await io.runHookMain(async (i) => { console.log(String(i.x)); });', { input: '{"x":7}' });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), '7');
  assert.equal(r.stderr, '');
});

test('runHookMain gives {} when stdin is not JSON', () => {
  const r = runSnippet('await io.runHookMain(async (i) => { console.log(String(Object.keys(i).length)); });', {
    input: 'garbage',
  });
  assert.equal(r.stdout.trim(), '0');
});

test('runHookMain uses a number returned by fn as the exit code', () => {
  const r = runSnippet('await io.runHookMain(async () => 2);');
  assert.equal(r.code, 2);
});

test('runHookMain turns an error into one stderr line and exit 0', () => {
  const r = runSnippet('await io.runHookMain(async () => { throw new Error("boom\\nsecond line"); });');
  assert.equal(r.code, 0);
  assert.equal(r.stderr, 'guilda: boom\n');
  assert.equal(r.stdout, '');
});
