import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText, globMatch } from '../scripts/lib/scan.mjs';

// Fake secrets are built in code so this file holds no literal token.
const GH = 'ghp_' + 'A'.repeat(36);
const ANT = 'sk-ant-' + 'a1_-'.repeat(6);
const AWS = 'AKIA' + 'B1'.repeat(8);
const PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----';

test('detects GitHub tokens (ghp_, gho_, ghs_)', () => {
  for (const p of ['ghp_', 'gho_', 'ghs_']) {
    assert.deepEqual(scanText(`x = "${p}${'Z9'.repeat(18)}"`), [{ kind: 'secret', line: 1 }]);
  }
});

test('a GitHub token with 35 characters is not a match', () => {
  assert.deepEqual(scanText('ghp_' + 'A'.repeat(35)), []);
});

test('detects an Anthropic key', () => {
  assert.deepEqual(scanText(ANT), [{ kind: 'secret', line: 1 }]);
});

test('detects an AWS access key id', () => {
  assert.deepEqual(scanText(AWS), [{ kind: 'secret', line: 1 }]);
});

test('detects a private key header', () => {
  assert.deepEqual(scanText(PEM), [{ kind: 'secret', line: 1 }]);
});

test('detects absolute paths of all four shapes', () => {
  const lines = [
    'C:' + '\\Users\\name\\x',
    'D:' + '/Users/name/x',
    '/home' + '/name/x',
    '/Users' + '/name/x',
  ];
  assert.deepEqual(
    scanText(lines.join('\n')),
    lines.map((_, i) => ({ kind: 'abs-path', line: i + 1 })),
  );
});

test('reports the line number and clean lines give nothing', () => {
  assert.deepEqual(scanText(`one\ntwo\n${GH}\nfour`), [{ kind: 'secret', line: 3 }]);
  assert.deepEqual(scanText('plain text\nrelative/path/file.js'), []);
});

test('the result never holds the secret text', () => {
  const out = JSON.stringify(scanText(`${GH}\n${ANT}\n${AWS}\n${'C:' + '\\Users\\name\\x'}`));
  for (const s of [GH, ANT, AWS, 'name']) assert.ok(!out.includes(s));
});

test('globMatch: * stays in one segment, ** crosses segments', () => {
  assert.ok(globMatch('tests/*.mjs', 'tests/a.mjs'));
  assert.ok(!globMatch('tests/*.mjs', 'tests/sub/a.mjs'));
  assert.ok(globMatch('tests/**', 'tests/sub/deep/a.mjs'));
  assert.ok(globMatch('**/fixtures/**', 'a/b/fixtures/c.txt'));
  assert.ok(!globMatch('tests/a.mjs', 'tests/ab.mjs'));
  assert.ok(globMatch('a.b', 'a.b'));
  assert.ok(!globMatch('a.b', 'aXb'));
});
