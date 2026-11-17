import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { writeSignal } from '../scripts/lib/queue.mjs';
import { SETUP_NOTICE } from '../scripts/lib/project.mjs';
import { parseBlocks, blockHash, keyOf, buildIndex, check, showBlock } from '../scripts/lib/trace.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'trace.mjs');
const QUEUE = path.join(REPO_ROOT, 'scripts', 'queue.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'trace');
const SPECS = path.join('docs', 'superpowers', 'specs');
const HEX8 = /^[0-9a-f]{8}$/;
const MAX_INDEX_MS = 1000;
const REGISTER_BLOCKS = 80;
const REGISTER_MIN_LINES = 1400;
const T0 = Date.parse('2026-11-17T10:00:00.000Z');
const MIN = 60000;
const at = (min) => new Date(T0 + min * MIN).toISOString();

/** A temp project with a .guilda folder, a git repository and the given files. */
function project(files = {}, { git = true, config = MINIMAL_CONFIG } = {}) {
  const dir = tempProject({ config, git });
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  return dir;
}

function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

const spec = (name) => path.join(SPECS, name);
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Stage the files by name, then commit in a second command. Returns the commit. */
function commit(dir, message, ...files) {
  git(dir, 'add', '--', ...files);
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

function trace(dir, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

const indexFile = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.guilda', 'trace', 'index.json'), 'utf8'));
const hashOf = (dir, key) => buildIndex(dir).blocks[key].hash;
const lines = (s) => s.split('\n');

const S1_SPEC = [
  '# A',
  '',
  '### D1 — One',
  '',
  'The body of One.',
  '',
  '### D2 — Two `@decided`',
  '',
  'The body of Two',
  'has two lines.',
  '',
  '```',
  '### D3 — Three',
  '```',
  '',
].join('\n');

test('index skips a heading in a code fence', () => {
  const dir = project({ [spec('a.md')]: S1_SPEC }, { git: false });
  const r = trace(dir, 'index');
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(r.out, 'trace: 2 blocks, 0 citations\n');
  const idx = indexFile(dir);
  assert.match(idx.generator, /^guilda \S+$/);
  assert.deepEqual(Object.keys(idx.blocks).sort(), ['D1', 'D2']);
  assert.equal(idx.blocks.D1.file, 'docs/superpowers/specs/a.md');
  assert.equal(idx.blocks.D1.start, 3);
  assert.equal(idx.blocks.D2.start, 7);
  assert.equal(idx.blocks.D1.end, 5);
  assert.ok(idx.blocks.D2.end >= 14, 'the fence is part of D2');
  assert.match(idx.blocks.D1.hash, HEX8);
  assert.match(idx.blocks.D2.hash, HEX8);
  const left = fs.readdirSync(path.join(dir, '.guilda', 'trace'));
  assert.deepEqual(left, ['index.json'], 'no temp file is left');
});

test('hash ignores tags and white space', () => {
  const dir = project({ [spec('a.md')]: S1_SPEC }, { git: false });
  const first = hashOf(dir, 'D2');
  const edit = (from, to) => {
    write(dir, spec('a.md'), S1_SPEC.replace(from, to));
    assert.equal(trace(dir, 'index').code, 0);
    return indexFile(dir).blocks.D2.hash;
  };
  assert.equal(edit('`@decided`', '`@proposed`'), first);
  assert.equal(edit('The body of Two\nhas two lines.', 'The body  of\nTwo has two lines.'), first);
  assert.notEqual(edit('The body of Two', 'The body of Three'), first);
  assert.equal(blockHash('Two', 'a\nb'), blockHash('Two `@open`', ['a', '  b']));
});

/** The fixture of S3: the spec of S1 and a plan at commit A, then commit B changes D2. */
function s3Fixture() {
  const dir = project({ [spec('a.md')]: S1_SPEC, 'README.md': 'base\n' });
  commit(dir, 'base', 'README.md');
  const hashA = hashOf(dir, 'D2');
  write(dir, spec('a.plan.md'), `# Plan\n\n### T1 — Build\n\nOwns: D2\nUses: D2@${hashA}\n`);
  const A = commit(dir, 'A', spec('a.md'), spec('a.plan.md'));
  write(dir, spec('a.md'), S1_SPEC.replace('has two lines.', 'has two lines and a change.'));
  const B = commit(dir, 'B', spec('a.md'));
  return { dir, hashA, hashB: hashOf(dir, 'D2'), A, B };
}

test('suspect link, then ack', () => {
  const { dir, hashA, hashB } = s3Fixture();
  assert.notEqual(hashA, hashB);
  const r = trace(dir, 'check');
  assert.equal(r.code, 1, r.out);
  assert.ok(lines(r.out).includes(`SUSPECT a.plan#T1 D2 ${hashA} → ${hashB}`), r.out);
  assert.match(r.out, /has two lines\.$/m, 'the block at A');
  assert.match(r.out, /has two lines and a change\./, 'the block at B');
  assert.ok(lines(r.out).includes('read the change; the task can still match'), r.out);

  const ack = trace(dir, 'ack', 'a.plan#T1', 'D2');
  assert.equal(ack.code, 0, ack.out + ack.err);
  assert.match(fs.readFileSync(path.join(dir, spec('a.plan.md')), 'utf8'), new RegExp(`^Uses: D2@${hashB}$`, 'm'));
  const again = trace(dir, 'check');
  assert.equal(again.code, 0, again.out);
  assert.doesNotMatch(again.out, /SUSPECT/);
});

test('unknown, ambiguous and qualified keys', () => {
  const dir = project(
    {
      [spec('a.md')]: '### S1 — First\n\nA one.\n\n### D1 — Decision\n\nD one.\n',
      [spec('b.md')]: '### S1 — First\n\nB one.\n',
    },
    { git: false },
  );
  const idx = buildIndex(dir);
  assert.deepEqual(Object.keys(idx.blocks).sort(), ['D1', 'a#S1', 'b#S1']);
  const uses = `D99@1a2b3c4d, S1@${idx.blocks['a#S1'].hash}, b#S1@${idx.blocks['b#S1'].hash}, D1@${idx.blocks.D1.hash}`;
  write(dir, spec('p.plan.md'), `### T1 — Task\n\nUses: ${uses}\n`);
  const r = trace(dir, 'check');
  assert.equal(r.code, 1, r.out);
  const out = lines(r.out);
  assert.ok(out.includes('UNKNOWN p.plan#T1 D99'), r.out);
  assert.ok(out.includes('AMBIGUOUS p.plan#T1 S1'), r.out);
  assert.doesNotMatch(r.out, /b#S1/);
  assert.doesNotMatch(r.out, / D1\b/);
  const findings = check(dir, { short: true });
  assert.deepEqual(findings.map((f) => f.kind).sort(), ['AMBIGUOUS', 'UNKNOWN']);
});

test('moved ID and plan parts', () => {
  const d7 = '### D7 — Moves\n\nThe body of D7.\n';
  const dir = project({ [spec('a.md')]: `# A\n\n${d7}` });
  const h = hashOf(dir, 'D7');
  write(dir, spec('c.plan.md'), `### T9 — Uses D7\n\nUses: D7@${h}\n`);
  write(
    dir,
    spec('x.md'),
    `# X\n\n## Plan: Part 1\n\n### T1 — One\n\nUses: D7@${h}\n\n## Plan: Part 2\n\n### T1 — Two\n\nUses: D7@${h}\n`,
  );
  commit(dir, 'A', spec('a.md'), spec('c.plan.md'), spec('x.md'));
  write(dir, spec('a.md'), '# A\n\nNothing here now.\n');
  write(dir, spec('b.md'), `# B\n\n${d7}`);
  commit(dir, 'B', spec('a.md'), spec('b.md'));

  const r = trace(dir, 'check');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /D7/);
  assert.doesNotMatch(r.out, /DUPLICATE/);
  const idx = indexFile(dir);
  assert.equal(idx.blocks.D7.file, 'docs/superpowers/specs/b.md');
  assert.equal(idx.blocks.D7.hash, h);
  assert.ok(idx.blocks['x#Part1.T1'], 'Part 1 key');
  assert.ok(idx.blocks['x#Part2.T1'], 'Part 2 key');
  assert.deepEqual(idx.errors, []);
});

test('no-owner only for covered IDs', () => {
  const dir = project(
    { [spec('a.md')]: '### D1 — One\n\nOne.\n\n### D2 — Two\n\nTwo.\n\n### D3 — Three\n\nThree.\n' },
    { git: false },
  );
  const idx = buildIndex(dir);
  write(
    dir,
    spec('p.plan.md'),
    `# Plan\n\nCovers: D1, D2\n\n### T1 — Build\n\nOwns: D1\nUses: D1@${idx.blocks.D1.hash}, D3@${idx.blocks.D3.hash}\n`,
  );
  const r = trace(dir, 'check');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(lines(r.out.trim()).filter((l) => l.startsWith('NO-OWNER')), ['NO-OWNER p.plan D2']);
  assert.deepEqual(buildIndex(dir).blocks.D1.owners, ['p.plan#T1']);
});

test('show by ID and lost read commit', () => {
  const { dir, hashA, A } = s3Fixture();
  const main = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  // A queue dispatch that read D2 at commit A.
  write(
    dir,
    '.guilda/queue/journal.jsonl',
    [
      { seq: 1, t: at(0), type: 'plan', plan: 'w.plan.md', part: null, work: 'w-00000001', slots: 1 },
      { seq: 2, t: at(0), type: 'task', task: 'T2', work: 'w-00000001', key: 'w.plan#T2', title: 'B' },
      { seq: 3, t: at(0), type: 'state', task: 'T2', from: 'pending', to: 'ready', cause: 'deps' },
      { seq: 4, t: at(1), type: 'dispatch', task: 'T2', attempt: 1, address: 'T2-exe-7f2a', role: 'exe', check: false, baseCommit: A, uses: [`D2@${hashA}`] },
      { seq: 5, t: at(1), type: 'state', task: 'T2', from: 'ready', to: 'dispatched', cause: 'dispatch' },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n') + '\n',
  );
  // A rebase onto a new commit of the base branch rewrites A and B.
  git(dir, 'branch', 'feat');
  git(dir, 'reset', '-q', '--hard', 'HEAD~2');
  write(dir, 'NOTES.md', 'a new base commit\n');
  commit(dir, 'new base', 'NOTES.md');
  git(dir, 'checkout', '-q', 'feat');
  git(dir, 'rebase', '-q', main);
  assert.equal(git(dir, 'cat-file', '-t', A), 'commit', 'A stays in the object store');
  const headB = git(dir, 'rev-parse', 'HEAD');

  const specLines = fs.readFileSync(path.join(dir, spec('a.md')), 'utf8').split('\n');
  const d2 = specLines.slice(6, 14).join('\n');
  const shown = trace(dir, 'show', 'D2');
  assert.equal(shown.code, 0, shown.out + shown.err);
  assert.ok(shown.out.startsWith(`${d2}\n`), shown.out);
  assert.match(shown.out, /^owners: a\.plan#T1$/m);
  assert.match(shown.out, /^citers: .*a\.plan#T1@/m);
  assert.match(shown.out, /journal#T2-exe-7f2a@/);
  assert.doesNotMatch(shown.out, /### D1/);
  const atB = trace(dir, 'show', 'D2', '--at', headB);
  assert.equal(atB.code, 0, atB.err);
  assert.equal(atB.out, `${d2}\n`);
  assert.equal(showBlock(dir, 'D2', { at: headB }), d2);
  assert.equal(trace(dir, 'show', 'D99').code, 1);

  const r = trace(dir, 'check');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^SUSPECT journal#T2-exe-7f2a D2 /m);
  assert.ok(lines(r.out).some((l) => l.includes('the read commit is not in the history')), r.out);
  assert.match(r.out, /has two lines and a change\./);
  assert.equal(indexFile(dir).blocks.D2.citers.find((c) => c.citer === 'journal#T2-exe-7f2a').readCommit, null);
});

function q(dir, min, ...args) {
  const r = spawnSync(process.execPath, [QUEUE, dir, ...args, '--now', at(min)], { encoding: 'utf8' });
  assert.equal(r.status, 0, (r.stdout ?? '') + (r.stderr ?? ''));
  return r.stdout;
}

/** The queue of S35: T2 dispatched with a brief that cites D2 at A, then commit B changes D2. */
function s35Fixture() {
  const dir = project({ [spec('a.md')]: S1_SPEC, 'w.plan.md': '# Work\n\n### T2 — B\n\n- Goal: build.\n' });
  const hashA = hashOf(dir, 'D2');
  const A = commit(dir, 'A', spec('a.md'));
  write(dir, '.guilda/work/T2.md', `Uses: D2@${hashA}\n`);
  q(dir, 0, 'init', 'w.plan.md', '--slots', '1');
  q(dir, 0, 'sync');
  const out = q(dir, 1, 'dispatch', 'T2', '--role', 'exe', '--tool', 'claude', '--tier', 'master', '--brief', '.guilda/work/T2.md', '--base', A);
  const address = /address (\S+)$/m.exec(out)[1];
  write(dir, spec('a.md'), S1_SPEC.replace('has two lines.', 'has two lines and a change.'));
  const B = commit(dir, 'B', spec('a.md'));
  writeSignal(dir, { task: 'T2', attempt: 1 }, 'started', { at: at(2) });
  writeSignal(dir, { task: 'T2', attempt: 1 }, 'done', { at: at(3), reason: 'finished', usage: null });
  q(dir, 4, 'sync');
  return { dir, address, hashA, hashB: hashOf(dir, 'D2'), B };
}

test('only the last attempt of an open task cites', () => {
  const one = s35Fixture();
  const first = trace(one.dir, 'check');
  assert.equal(first.code, 1, first.out);
  assert.ok(lines(first.out).includes(`SUSPECT journal#${one.address} D2 ${one.hashA} → ${one.hashB}`), first.out);
  q(one.dir, 5, 'reject', 'T2');
  q(one.dir, 5, 'sync');
  write(one.dir, '.guilda/work/T2.md', `Uses: D2@${one.hashB}\n`);
  q(one.dir, 6, 'dispatch', 'T2', '--role', 'exe', '--tool', 'claude', '--tier', 'master', '--brief', '.guilda/work/T2.md', '--base', one.B);
  const second = trace(one.dir, 'check');
  assert.equal(second.code, 0, second.out);
  assert.ok(!second.out.includes(one.address), second.out);

  const two = s35Fixture();
  assert.equal(trace(two.dir, 'check').code, 1);
  q(two.dir, 5, 'approve', 'T2');
  const closed = trace(two.dir, 'check');
  assert.equal(closed.code, 0, closed.out);
  assert.doesNotMatch(closed.out, /journal#/);
});

test('legacy only before the install commit', () => {
  const plan = spec('old.plan.md');
  const dir = project({ [plan]: '# Plan\n\n### T1 — Old\n\n- Goal: old.\n' });
  commit(dir, '1', plan, '.guilda/config.json');
  write(dir, '.guilda/config.json', JSON.stringify({ ...MINIMAL_CONFIG, guildaVersion: '0.3.0' }, null, 2));
  commit(dir, '2', '.guilda/config.json');
  fs.appendFileSync(path.join(dir, plan), '\n### T2 — New\n\n- Goal: new.\n');
  commit(dir, '3', plan);
  write(dir, spec('new.plan.md'), '### T1 — Not committed\n\n- Goal: new.\n');
  const r = trace(dir, 'check');
  assert.equal(r.code, 1, r.out);
  const out = lines(r.out);
  assert.ok(out.includes('LEGACY old.plan#T1'), r.out);
  assert.ok(out.includes('NO-USES old.plan#T2'), r.out);
  assert.ok(out.includes('NO-USES new.plan#T1'), r.out);
  assert.ok(!out.includes('NO-USES old.plan#T1'), r.out);

  const other = project({ [plan]: '# Plan\n\n### T1 — Old\n\n- Goal: old.\n' });
  commit(other, '1', plan, '.guilda/config.json');
  const r2 = trace(other, 'check');
  assert.equal(r2.code, 1, r2.out);
  assert.ok(lines(r2.out).includes('NO-USES old.plan#T1'), r2.out);
  assert.doesNotMatch(r2.out, /LEGACY/);
});

test('a file with \\r\\n has the hash of the same file with \\n', () => {
  const crlf = S1_SPEC.replace(/\n/g, '\r\n');
  const a = parseBlocks(S1_SPEC, 'docs/superpowers/specs/a.md');
  const b = parseBlocks(crlf, 'docs/superpowers/specs/a.md');
  assert.deepEqual(b.map((x) => x.id), ['D1', 'D2']);
  assert.deepEqual(b.map((x) => x.hash), a.map((x) => x.hash));
  assert.deepEqual(b.map((x) => x.title), ['One', 'Two']);
  assert.equal(blockHash('Two', 'a\r\nb'), blockHash('Two', 'a\nb'));
});

test('two files with one stem give DUPLICATE-FILE', () => {
  const dir = project(
    { [spec('x/a.md')]: '### D1 — One\n\nOne.\n', [spec('y/a.md')]: '### D2 — Two\n\nTwo.\n' },
    { git: false },
  );
  const r = trace(dir, 'index');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^DUPLICATE-FILE a$/m);
  assert.ok(indexFile(dir).errors.some((e) => e.kind === 'DUPLICATE-FILE' && e.stem === 'a'));
  assert.equal(trace(dir, 'check').code, 1);
});

test('ack refuses a journal citer with not a plan task', () => {
  const { dir } = s3Fixture();
  const r = trace(dir, 'ack', 'journal#T2-exe-7f2a', 'D2');
  assert.equal(r.code, 1);
  assert.match(r.out + r.err, /not a plan task/);
  const spec1 = trace(dir, 'ack', 'D1', 'D2');
  assert.equal(spec1.code, 1);
  assert.match(spec1.out + spec1.err, /not a plan task/);
  assert.match(trace(dir, 'ack', 'a.plan#T9', 'D2').out, /unknown citer/);
  assert.match(trace(dir, 'ack', 'a.plan#T1', 'D99').out, /unknown key/);
});

test('the register of 1,400 lines is indexed in under 1 s', () => {
  const parts = ['# Register', ''];
  for (let i = 1; i <= REGISTER_BLOCKS; i++) {
    parts.push(`### D${i} — Decision ${i} \`@decided\``, '');
    for (let j = 0; j < 14; j++) parts.push(`Line ${j} of the decision ${i}, with   some words.`);
    parts.push('', '```', `### D${i + 1000} — In a fence`, '```', '');
  }
  assert.ok(parts.length >= REGISTER_MIN_LINES, `${parts.length} lines`);
  const dir = project({ [spec('2026-11-09-guilda-decisions.md')]: parts.join('\n') }, { git: false });
  const t = process.hrtime.bigint();
  const r = trace(dir, 'index');
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, `trace: ${REGISTER_BLOCKS} blocks, 0 citations\n`);
  assert.ok(ms < MAX_INDEX_MS, `${ms} ms`);
});

test('an ID with a letter suffix is a block', () => {
  const dir = project(
    { [spec('a.md')]: '### D5a — Split\n\nPart a.\n', [spec('a.plan.md')]: '### T21b — Second half\n\n- Goal: b.\n' },
    { git: false },
  );
  const idx = buildIndex(dir);
  assert.ok(idx.blocks.D5a);
  assert.ok(idx.blocks['a.plan#T21b']);
  assert.equal(keyOf(parseBlocks('### T21b — X\n', 'docs/superpowers/specs/a.plan.md')[0], idx), 'a.plan#T21b');
  assert.equal(keyOf(idx.blocks.D5a, idx), 'D5a');
});

test('the fixture register gives its blocks, and no .guilda folder is refused', () => {
  const dir = project({ [spec('fixture.md')]: fixture('fences.md') }, { git: false });
  const r = trace(dir, 'index');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(Object.keys(indexFile(dir).blocks).sort(), ['D83', 'D84']);

  const bare = tempProject();
  write(bare, spec('a.md'), S1_SPEC);
  const refused = trace(bare, 'index');
  assert.equal(refused.code, 1);
  assert.equal(refused.out, `refused: guilda is not set up\n${SETUP_NOTICE}\n`);
  assert.equal(fs.existsSync(path.join(bare, '.guilda')), false);
});
