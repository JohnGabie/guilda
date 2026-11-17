import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempProject, runHook, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'cost.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'cost');
const SESSION = path.join(FIXTURES, 'session.jsonl');
const STUB = path.join(FIXTURES, 'stub-analyzer.py');
const ANALYZER_OUTPUT = path.join(FIXTURES, 'analyzer-output.txt');
const TWO_LINES = path.join(REPO_ROOT, 'tests', 'fixtures', 'transcripts', 'two-lines.jsonl');

const DATE = '2026-11-10';
const DAY_BEFORE = '2026-11-09';
const DAY_AFTER = '2026-11-11';
const SEVEN_BEFORE = '2026-11-03';
const EIGHT_BEFORE = '2026-11-02';
const WORK = 'w-0000aaaa';
const WORK2 = 'w-0000bbbb';
const MODEL = 'claude-test-model';
const PLAN = 'docs/superpowers/specs/login.plan.md';
const SESSION_SUMS = { input: 40, output: 10, cacheRead: 300, cacheCreation: 5 };

const hasPython = spawnSync('python3', ['--version']).status === 0;

/** The journal events of one work: two tasks of S24, each with one work run and its agent event. */
function workEvents(work, plan, ids = ['T1', 'T2'], agents = ['a1', 'a2']) {
  const ev = [{ type: 'plan', t: '2026-11-10T09:00:00.000Z', plan, part: null, work, slots: 2 }];
  const uses = [['D1@11111111', 'D2@22222222'], ['D1@11111111']];
  ids.forEach((id, i) => {
    ev.push({ type: 'task', t: '2026-11-10T09:00:00.000Z', task: id, work, key: `login.plan#${id}`, title: id, deps: [], uses: uses[i], owns: [] });
  });
  ids.forEach((id, i) => {
    const address = `${id}-exe-${(0xa000 + i).toString(16)}`;
    ev.push({ type: 'dispatch', t: '2026-11-10T09:01:00.000Z', task: id, attempt: 1, address, role: 'exe', tool: 'claude', inSession: true, check: false, tier: 'master', session: null, briefFile: null, baseCommit: null, uses: uses[i] });
    ev.push({ type: 'agent', t: '2026-11-10T09:02:00.000Z', address, task: id, attempt: 1, agentId: agents[i] });
  });
  return ev;
}

function writeJournal(dir, events) {
  fs.mkdirSync(path.join(dir, '.guilda', 'queue'), { recursive: true });
  const text = events.map((e, i) => JSON.stringify({ seq: i + 1, ...e })).join('\n');
  fs.writeFileSync(path.join(dir, '.guilda', 'queue', 'journal.jsonl'), `${text}\n`);
}

function writeAudit(dir, lines) {
  fs.writeFileSync(path.join(dir, '.guilda', 'audit.jsonl'), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
}

/** The S24 project: T1 has a tokens line with task null (the agent event maps it), T2 a line with its task. */
function s24Project() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeJournal(dir, workEvents(WORK, PLAN));
  writeAudit(dir, [
    { kind: 'end', t: '2026-11-10T09:30:00.000Z', agentId: 'a1', agentType: 'guilda:executor', task: null, transcript: null, copy: null },
    { kind: 'tokens', t: '2026-11-10T09:30:00.000Z', agentId: 'a1', task: null, model: MODEL, input: 1000000, cacheRead: 0, cacheCreation: 0, output: 100000 },
    { kind: 'tokens', t: '2026-11-10T09:40:00.000Z', agentId: 'a2', task: 'T2', model: MODEL, input: 500000, cacheRead: 0, cacheCreation: 0, output: 0 },
  ]);
  return dir;
}

function pricesFile(dir, over = {}, models = { [MODEL]: { input: 2, output: 10, cacheRead: 0.2, cacheCreation: 2.5 } }) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda prices ')), 'prices.json');
  const prices = {
    priceDate: DATE,
    priceSource: 'https://example.com/pricing',
    models,
    usdPerMTok: true,
    brlPerUsd: 5,
    rateDate: DATE,
    rateSource: 'https://example.com/ptax',
    ...over,
  };
  fs.writeFileSync(file, JSON.stringify(prices));
  return file;
}

function cost(dir, args, env = process.env) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], { encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const costsDir = (dir) => path.join(dir, '.guilda', 'costs');
const records = (dir) => (fs.existsSync(costsDir(dir)) ? fs.readdirSync(costsDir(dir)) : []);
const readRecord = (dir, name) => JSON.parse(fs.readFileSync(path.join(costsDir(dir), name), 'utf8'));
const recordName = (work = WORK) => `login-${work}-${DATE}.json`;

test('the cost record', () => {
  // Run 1: the record of the work.
  const dir = s24Project();
  const r1 = cost(dir, ['--prices', pricesFile(dir), '--date', DATE]);
  assert.equal(r1.code, 0, r1.out);
  assert.deepEqual(records(dir), [recordName()]);
  const rec = readRecord(dir, recordName());
  assert.equal(rec.generator.startsWith('guilda '), true);
  assert.equal(rec.build, PLAN);
  assert.equal(rec.prices.priceDate, DATE);
  assert.equal(rec.tasks.T1.usd, 3);
  assert.equal(rec.tasks.T1.brl, 15);
  assert.deepEqual(rec.tasks.T1.tokens, { input: 1000000, cacheRead: 0, cacheCreation: 0, output: 100000 });
  assert.equal(rec.tasks.T2.usd, 1);
  assert.equal(rec.tasks.T2.brl, 5);
  assert.equal(rec.total.usd, 4);
  assert.equal(rec.total.brl, 20);
  assert.deepEqual(rec.total.tokens, { input: 1500000, cacheRead: 0, cacheCreation: 0, output: 100000 });
  // Equal parts (U6): T1 gives half to D1 and half to D2.
  assert.equal(rec.blocks.D1.usd, 2.5);
  assert.equal(rec.blocks.D1.brl, 12.5);
  assert.equal(rec.blocks.D2.usd, 1.5);
  assert.deepEqual(rec.blocks.D1.tokens, { input: 1000000, cacheRead: 0, cacheCreation: 0, output: 50000 });
  assert.equal(rec.session, null);
  const summary = r1.stdout.trim().split('\n').pop();
  assert.equal(summary, `cost: login: 1600000 tokens, US$ 4.00, R$ 20.00 at list price (prices of ${DATE})`);
  assert.ok(summary.endsWith(`at list price (prices of ${DATE})`));

  // Run 2: prices of the day before.
  const dir2 = s24Project();
  const r2 = cost(dir2, ['--prices', pricesFile(dir2, { priceDate: DAY_BEFORE }), '--date', DATE]);
  assert.equal(r2.code, 1);
  assert.match(r2.out, new RegExp(`refused: prices of ${DAY_BEFORE}, the record is ${DATE}`));
  assert.deepEqual(records(dir2), []);

  // Run 3: no price for the model of the audit log.
  const dir3 = s24Project();
  const r3 = cost(dir3, ['--prices', pricesFile(dir3, {}, { 'other-model': { input: 1, output: 1, cacheRead: 1, cacheCreation: 1 } }), '--date', DATE]);
  assert.equal(r3.code, 1);
  assert.match(r3.out, /refused: no price for claude-test-model/);
  assert.deepEqual(records(dir3), []);

  // Run 4: the session level from a stub analyzer.
  if (!hasPython) return;
  const dir4 = s24Project();
  const r4 = cost(dir4, ['--prices', pricesFile(dir4), '--date', DATE, '--session', SESSION, '--analyzer', STUB]);
  assert.equal(r4.code, 0, r4.out);
  const rec4 = readRecord(dir4, recordName());
  assert.deepEqual(rec4.session.tokens, SESSION_SUMS);
  assert.ok(recordName().includes(WORK));
  assert.equal(rec4.total.usd, 4);
});

test('the session level without superpowers', () => {
  const dir = s24Project();
  const noPython = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda no python '));
  const r = cost(dir, ['--prices', pricesFile(dir), '--date', DATE, '--session', SESSION, '--analyzer', STUB], { ...process.env, PATH: noPython });
  assert.equal(r.code, 0, r.out);
  assert.equal(readRecord(dir, recordName()).session, null);
  assert.match(r.stdout, /session: not measured/);

  // No analyzer file: the same result.
  const dir2 = s24Project();
  const r2 = cost(dir2, ['--prices', pricesFile(dir2), '--date', DATE, '--session', SESSION, '--analyzer', path.join(noPython, 'analyze-token-usage.py')]);
  assert.equal(r2.code, 0, r2.out);
  assert.equal(readRecord(dir2, recordName()).session, null);
  assert.match(r2.stdout, /session: not measured/);
});

test('two works with no --work are refused with the work IDs', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeJournal(dir, [...workEvents(WORK, PLAN), ...workEvents(WORK2, 'docs/superpowers/specs/other.plan.md', ['T3', 'T4'], ['a3', 'a4'])]);
  writeAudit(dir, [{ kind: 'tokens', t: '2026-11-10T09:30:00.000Z', agentId: 'a3', task: null, model: MODEL, input: 1000000, cacheRead: 0, cacheCreation: 0, output: 0 }]);
  const r = cost(dir, ['--prices', pricesFile(dir), '--date', DATE]);
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: name the work/);
  assert.ok(r.out.includes(WORK) && r.out.includes(WORK2), r.out);
  assert.deepEqual(records(dir), []);

  const r2 = cost(dir, ['--prices', pricesFile(dir), '--date', DATE, '--work', WORK2]);
  assert.equal(r2.code, 0, r2.out);
  const rec = readRecord(dir, `other-${WORK2}-${DATE}.json`);
  assert.deepEqual(Object.keys(rec.tasks).sort(), ['T3', 'T4']);
  assert.equal(rec.tasks.T3.usd, 2);
  assert.equal(rec.total.usd, 2);
});

test('a rateDate after the record date is refused', () => {
  const dir = s24Project();
  const r = cost(dir, ['--prices', pricesFile(dir, { rateDate: DAY_AFTER }), '--date', DATE]);
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: rate of 2026-11-11/);
  assert.deepEqual(records(dir), []);
  // The same day is valid.
  const ok = cost(dir, ['--prices', pricesFile(dir, { rateDate: DATE }), '--date', DATE]);
  assert.equal(ok.code, 0, ok.out);
});

test('a rateDate 8 days before is refused', () => {
  const dir = s24Project();
  const r = cost(dir, ['--prices', pricesFile(dir, { rateDate: EIGHT_BEFORE }), '--date', DATE]);
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: rate of 2026-11-02/);
  assert.deepEqual(records(dir), []);
  // 7 days before is valid: a weekend or a holiday has no rate.
  const ok = cost(dir, ['--prices', pricesFile(dir, { rateDate: SEVEN_BEFORE }), '--date', DATE]);
  assert.equal(ok.code, 0, ok.out);
});

test('the analyzer fixture gives the four sums', async (t) => {
  const { parseAnalyzerOutput } = await import('../scripts/cost.mjs');
  assert.deepEqual(parseAnalyzerOutput(fs.readFileSync(ANALYZER_OUTPUT, 'utf8')), SESSION_SUMS);
  assert.equal(parseAnalyzerOutput('no totals here'), null);
  // The fixture is the output form of the installed analyzer: found at run time, never named in a file.
  const base = path.join(os.homedir(), '.claude', 'plugins', 'cache');
  let found = null;
  try {
    for (const market of fs.readdirSync(base)) {
      const sp = path.join(base, market, 'superpowers');
      if (!fs.existsSync(sp)) continue;
      for (const v of fs.readdirSync(sp).sort()) {
        const f = path.join(sp, v, 'tests', 'claude-code', 'analyze-token-usage.py');
        if (fs.existsSync(f)) found = f;
      }
    }
  } catch {
    found = null;
  }
  if (!found || !hasPython) {
    t.diagnostic('installed analyzer not found: output form not compared');
    return;
  }
  const r = spawnSync('python3', [found, SESSION], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, fs.readFileSync(ANALYZER_OUTPUT, 'utf8'));
});

test('cost.mjs reads the tokens lines that agent-end.mjs wrote', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  writeJournal(dir, workEvents(WORK, PLAN, ['T5'], ['ag1']));
  const end = runHook('scripts/hooks/agent-end.mjs', {
    session_id: 's1',
    cwd: dir,
    hook_event_name: 'SubagentStop',
    stop_hook_active: false,
    agent_id: 'ag1',
    agent_type: 'guilda:executor',
    agent_transcript_path: TWO_LINES,
    last_assistant_message: 'Status: done',
  }, dir);
  assert.equal(end.code, 0, end.stderr);
  const prices = pricesFile(dir, {}, { 'claude-sonnet-5-5': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 } });
  const r = cost(dir, ['--prices', prices, '--date', DATE]);
  assert.equal(r.code, 0, r.out);
  const rec = readRecord(dir, recordName());
  assert.deepEqual(rec.tasks.T5.tokens, { input: 30, cacheRead: 300, cacheCreation: 5, output: 10 });
  // (30 * 3 + 300 * 0.3 + 5 * 3.75 + 10 * 15) / 1e6 = 0.00034875 -> 0.0003
  assert.equal(rec.tasks.T5.usd, 0.0003);
  assert.equal(rec.tasks.T5.brl, 0.0017);
});

test('an external run counts the usage list of its end signal', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const ev = workEvents(WORK, PLAN, ['T1'], ['a1']).filter((e) => e.type !== 'agent');
  const dispatch = ev.find((e) => e.type === 'dispatch');
  Object.assign(dispatch, { tool: 'codex', inSession: false });
  ev.push({ type: 'signal', t: '2026-11-10T09:50:00.000Z', address: dispatch.address, task: 'T1', attempt: 1, kind: 'done', at: '2026-11-10T09:50:00.000Z', reason: 'finished', usage: [{ model: MODEL, input: 1000000, cacheRead: 0, cacheCreation: 0, output: 0 }], tokens: null });
  writeJournal(dir, ev);
  const r = cost(dir, ['--prices', pricesFile(dir), '--date', DATE]);
  assert.equal(r.code, 0, r.out);
  assert.equal(readRecord(dir, recordName()).tasks.T1.usd, 2);
});

test('the cost fixtures hold no machine path', () => {
  for (const name of fs.readdirSync(FIXTURES)) {
    const text = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
    assert.doesNotMatch(text, /\/home\/|\/Users\/|\/tmp\/|[A-Z]:\\/, name);
  }
});
