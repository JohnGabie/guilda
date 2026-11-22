// Section 5h: the council script. S5-24, S5-25, S5-35 (script part), S5-45, and the register entry (S5-26 part).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, tempProject, MINIMAL_CONFIG } from './helpers.mjs';
import { writeUserRecord, makeRecord, appendRecord, loadKey } from '../scripts/lib/records.mjs';
import { mailboxAddresses, readMailbox, appendLine, readLines, withMailboxLock } from '../scripts/lib/bus.mjs';
import { main, councilState, DEFAULT_MAX_ROUNDS, JUDGE } from '../scripts/council.mjs';

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'council.mjs');
const SEC = 'guilda:security-lead';
const DEVOPS = 'guilda:devops-advisor';
const ARCH = 'guilda:architect';
const COUNCIL = /^council-[0-9a-f]{4}$/;

function setup() {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const env = { ...process.env, XDG_STATE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'guilda state ')) };
  delete env.CLAUDE_PROJECT_DIR;
  fs.writeFileSync(path.join(dir, 'q.md'), 'Which database for the new service?\n');
  return { dir, env };
}

/** One user record that `verify` accepts. */
function userRecord(ctx, text = 'Yes, open it.') {
  const rec = writeUserRecord(ctx.dir, { session: 's1', kind: 'answer', text, question: 'open the council?' }, ctx.env);
  assert.ok(rec, 'record written');
  return rec.id;
}

const run = (ctx, ...args) => main(args, { cwd: ctx.dir, env: ctx.env });
const channel = (ctx, id) => path.join(ctx.dir, '.guilda', 'bus', `${id}.jsonl`);
const raw = (ctx, id) => fs.readFileSync(channel(ctx, id), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

function openCouncil(ctx, members = `${ARCH},${SEC},${DEVOPS},user`, extra = []) {
  const r = run(ctx, 'open', '--question', 'q.md', '--members', members, '--format', 'debate', '--record', userRecord(ctx), ...extra);
  assert.equal(r.code, 0, r.lines.join('\n'));
  assert.match(r.lines[0], COUNCIL);
  return r.lines[0];
}

const say = (ctx, id, from, type, ...rest) => run(ctx, 'say', '--id', id, '--from', from, '--type', type, ...rest);
const judge = (ctx, id, type, ...rest) => say(ctx, id, JUDGE, type, ...rest);
const claimArgs = ['--claim', 'Use SQLite.', '--evidence', 'one file, no server', '--reason', 'the load is small'];

function started(ctx, members) {
  const id = openCouncil(ctx, members);
  assert.equal(judge(ctx, id, 'open').code, 0);
  return id;
}

// S5-24
test('S5-24: open needs a user record that verify accepts', () => {
  const ctx = setup();
  const base = ['open', '--question', 'q.md', '--members', `${ARCH},${SEC}`, '--format', 'debate'];
  const none = run(ctx, ...base);
  assert.deepEqual([none.code, none.lines], [1, ['refused: no approval']]);

  // A record with a bad mac: a real record whose text changed after the signing.
  const key = loadKey(ctx.dir, ctx.env, { create: true });
  const forged = makeRecord({ session: 's1', kind: 'answer', text: 'Yes.', question: null }, key, () => Buffer.from('00000009', 'hex'));
  appendRecord(ctx.dir, { ...forged, text: 'Yes, and delete all.' });
  assert.equal(forged.id, 'u-00000009');
  const bad = run(ctx, ...base, '--record', 'u-00000009');
  assert.deepEqual([bad.code, bad.lines], [1, ['refused: no approval']]);
  const unknown = run(ctx, ...base, '--record', 'u-0000000a');
  assert.deepEqual([unknown.code, unknown.lines], [1, ['refused: no approval']]);
  assert.deepEqual(mailboxAddresses(ctx.dir), []);
  const files = () => (fs.existsSync(path.join(ctx.dir, '.guilda', 'bus')) ? fs.readdirSync(path.join(ctx.dir, '.guilda', 'bus')) : []);
  assert.deepEqual(files().filter((f) => f.startsWith('council-')), []);

  const record = userRecord(ctx);
  const ok = run(ctx, ...base, '--record', record);
  assert.equal(ok.code, 0);
  assert.match(ok.lines[0], COUNCIL);
  const lines = raw(ctx, ok.lines[0]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, 'create');
  assert.equal(lines[0].record, record);
  assert.equal(lines[0].council, ok.lines[0]);
  assert.match(lines[0].id, /^c-[0-9a-f]{8}$/);
  assert.deepEqual(lines[0].members, [ARCH, SEC]);
  assert.equal(lines[0].maxRounds, DEFAULT_MAX_ROUNDS);
  assert.equal(DEFAULT_MAX_ROUNDS, 3);
  assert.equal(fs.existsSync(path.join(ctx.dir, '.guilda', 'council')), false);
});

test('S5-24: the real command line prints the council ID and the refusal', () => {
  const ctx = setup();
  const r = spawnSync(process.execPath, [SCRIPT, 'open', '--question', 'q.md', '--members', `${ARCH},${SEC}`, '--format', 'debate'], {
    cwd: ctx.dir, env: ctx.env, encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'refused: no approval\n');
  const ok = spawnSync(process.execPath, [SCRIPT, ctx.dir, 'open', '--question', path.join(ctx.dir, 'q.md'), '--members', `${ARCH},${SEC}`,
    '--format', 'adversarial', '--record', userRecord(ctx), '--max-rounds', '2'], { cwd: os.tmpdir(), env: ctx.env, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /^council-[0-9a-f]{4}\n$/);
  assert.equal(raw(ctx, ok.stdout.trim())[0].maxRounds, 2);
});

test('open refuses a bad member list, a bad format, a bad question and bad rounds with exit 2', () => {
  const ctx = setup();
  const record = userRecord(ctx);
  const good = ['--question', 'q.md', '--members', `${ARCH},${SEC}`, '--format', 'debate', '--record', record];
  const swap = (flag, value) => {
    const a = [...good];
    a[a.indexOf(flag) + 1] = value;
    return a;
  };
  for (const [flag, value, text] of [
    ['--members', ARCH, 'bad members'],
    ['--members', `${ARCH},${ARCH}`, 'bad members'],
    ['--members', `${ARCH},${JUDGE}`, 'bad members'],
    ['--members', `${ARCH},bad name`, 'bad members'],
    ['--format', 'chat', 'bad format'],
    ['--question', 'missing.md', 'bad question'],
  ]) {
    const r = run(ctx, 'open', ...swap(flag, value));
    assert.deepEqual([r.code, r.lines], [2, [text]], `${flag} ${value}`);
  }
  for (const rounds of ['0', '11', 'x', '-1']) {
    assert.equal(run(ctx, 'open', ...good, '--max-rounds', rounds).code, 2, rounds);
  }
  assert.equal(fs.readdirSync(path.join(ctx.dir, '.guilda', 'bus')).filter((f) => f.startsWith('council-')).length, 0);
});

test('a project with no .guilda folder gets the set-up notice', () => {
  const dir = tempProject();
  const r = main(['read', '--id', 'council-1a2b'], { cwd: dir, env: process.env });
  assert.equal(r.code, 1);
});

// S5-25, CNL1
test('S5-25: only the floor holder speaks', () => {
  const ctx = setup();
  const id = started(ctx);
  assert.equal(judge(ctx, id, 'floor', '--to', SEC).code, 0);
  const no = say(ctx, id, DEVOPS, 'claim', ...claimArgs);
  assert.deepEqual([no.code, no.lines], [1, ['refused: no floor']]);
  const callNo = say(ctx, id, DEVOPS, 'call', '--to', SEC);
  assert.deepEqual([callNo.code, callNo.lines], [1, ['refused: no floor']]);
  const yes = say(ctx, id, SEC, 'claim', ...claimArgs);
  assert.equal(yes.code, 0);
  const last = raw(ctx, id).at(-1);
  assert.deepEqual(
    [last.type, last.from, last.claim, last.evidence, last.reason, JSON.parse(yes.lines[0]).id === last.id],
    ['claim', SEC, 'Use SQLite.', 'one file, no server', 'the load is small', true],
  );
  // The member lost the floor with its claim.
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0], 'refused: no floor');
  assert.equal(raw(ctx, id).length, 4);
});

test('a claim needs a claim, evidence and a reason; a call needs a member', () => {
  const ctx = setup();
  const id = started(ctx);
  judge(ctx, id, 'floor', '--to', SEC);
  for (const args of [['--claim', 'x', '--evidence', 'y'], ['--claim', 'x', '--reason', 'z'], ['--evidence', 'y', '--reason', 'z'],
    ['--claim', ' ', '--evidence', 'y', '--reason', 'z']]) {
    assert.equal(say(ctx, id, SEC, 'claim', ...args).code, 2, args.join(' '));
  }
  assert.equal(say(ctx, id, SEC, 'call').code, 2);
  assert.equal(say(ctx, id, SEC, 'call', '--to', 'guilda:nobody').code, 2);
  assert.equal(say(ctx, id, SEC, 'call', '--to', SEC).code, 2);
  assert.equal(raw(ctx, id).length, 3);
});

test('the floor is held by one member; before open and after close nobody holds it', () => {
  const ctx = setup();
  const id = openCouncil(ctx);
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0], 'refused: no floor');
  assert.equal(judge(ctx, id, 'floor', '--to', SEC).lines[0], 'refused: not open');
  judge(ctx, id, 'open');
  assert.equal(judge(ctx, id, 'open').lines[0], 'refused: already open');
  judge(ctx, id, 'floor', '--to', SEC);
  judge(ctx, id, 'floor', '--to', DEVOPS);
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0], 'refused: no floor');
  assert.equal(say(ctx, id, DEVOPS, 'claim', ...claimArgs).code, 0);
  const state = councilState(raw(ctx, id));
  assert.equal(state.holder, null);
  assert.equal(judge(ctx, id, 'floor', '--to', 'guilda:nobody').code, 2);
  assert.equal(judge(ctx, id, 'floor').code, 2);
});

// S5-45
test('S5-45 judge lines: grant, deny, refusals and read --last', () => {
  const ctx = setup();
  const id = started(ctx, `${ARCH},${SEC}`);
  assert.equal(judge(ctx, id, 'floor', '--to', ARCH).code, 0);
  const call = say(ctx, id, ARCH, 'call', '--to', SEC);
  assert.equal(call.code, 0);
  const callId = JSON.parse(call.lines[0]).id;
  assert.deepEqual(say(ctx, id, SEC, 'grant', '--to', SEC).lines, ['refused: not the Judge']);
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0], 'refused: no floor');
  assert.equal(judge(ctx, id, 'grant', '--to', SEC, '--call', 'c-00000000').code, 2);
  assert.equal(judge(ctx, id, 'grant', '--to', SEC, '--call', callId).code, 0);
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).code, 0);
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0], 'refused: no floor');
  const last2 = run(ctx, 'read', '--id', id, '--last', '2');
  assert.equal(last2.code, 0);
  assert.deepEqual(last2.lines.map((l) => JSON.parse(l).type), ['grant', 'claim']);
  assert.equal(run(ctx, 'read', '--id', id).lines.length, 6);
  // A deny leaves nobody with the floor.
  judge(ctx, id, 'floor', '--to', ARCH);
  const c2 = JSON.parse(say(ctx, id, ARCH, 'call', '--to', SEC).lines[0]).id;
  assert.equal(judge(ctx, id, 'deny', '--to', SEC, '--call', c2).code, 0);
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0], 'refused: no floor');
  for (const t of ['open', 'floor', 'grant', 'deny', 'close']) {
    assert.equal(say(ctx, id, ARCH, t, '--to', SEC).lines[0], 'refused: not the Judge', t);
  }
  assert.equal(say(ctx, id, ARCH, 'create').code, 2);
});

test('read exits 1 with unknown council for a missing channel, and 2 for a bad ID', () => {
  const ctx = setup();
  assert.deepEqual(run(ctx, 'read', '--id', 'council-1a2b'), { code: 1, lines: ['unknown council'] });
  assert.equal(run(ctx, 'read', '--id', '../x').code, 2);
  assert.deepEqual(say(ctx, 'council-1a2b', SEC, 'claim', ...claimArgs), { code: 1, lines: ['unknown council'] });
});

// The rounds (U5-9)
test('maxRounds: after the limit the Judge cannot give the floor, and closes', () => {
  const ctx = setup();
  const id = started(ctx, `${ARCH},${SEC}`);
  const r = run(ctx, 'open', '--question', 'q.md', '--members', `${ARCH},${SEC}`, '--format', 'debate', '--record', userRecord(ctx), '--max-rounds', '1');
  const id1 = r.lines[0];
  judge(ctx, id1, 'open');
  for (const m of [ARCH, SEC]) {
    assert.equal(judge(ctx, id1, 'floor', '--to', m).code, 0);
    assert.equal(say(ctx, id1, m, 'claim', ...claimArgs).code, 0);
  }
  assert.deepEqual(judge(ctx, id1, 'floor', '--to', ARCH).lines, ['refused: round limit']);
  assert.deepEqual(judge(ctx, id1, 'grant', '--to', ARCH).lines, ['refused: round limit']);
  const positions = [];
  for (const m of [ARCH, SEC]) positions.push('--position', `${m}=${raw(ctx, id1).find((l) => l.type === 'claim' && l.from === m).id}`);
  assert.equal(judge(ctx, id1, 'close', ...positions).code, 0);
  assert.ok(id);
});

// CNL2/JDG3, the close and the decision, S5-26
test('close needs the last claim of each lead; the decision needs the user record and its text', () => {
  const ctx = setup();
  const id = started(ctx, `${ARCH},${SEC},user`);
  judge(ctx, id, 'floor', '--to', SEC);
  const secClaim = JSON.parse(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0]).id;
  judge(ctx, id, 'floor', '--to', ARCH);
  const archClaim = JSON.parse(say(ctx, id, ARCH, 'claim', '--claim', 'Use Postgres.', '--evidence', 'e', '--reason', 'r').lines[0]).id;
  assert.deepEqual(say(ctx, id, 'user', 'decision', '--decision', 'x', '--why', 'y', '--record', userRecord(ctx, 'x')).lines, ['refused: not closed']);
  // The positions: both leads, each a claim of that lead.
  for (const bad of [
    [`--position`, `${SEC}=${secClaim}`],
    ['--position', `${SEC}=${archClaim}`, '--position', `${ARCH}=${archClaim}`],
    ['--position', `${SEC}=${secClaim}`, '--position', `${ARCH}=c-00000000`],
    ['--position', `${SEC}=${secClaim}`, '--position', `${SEC}=${secClaim}`],
    ['--position', `user=none`, '--position', `${SEC}=${secClaim}`, '--position', `${ARCH}=${archClaim}`],
  ]) {
    assert.equal(judge(ctx, id, 'close', ...bad).code, 2, bad.join(' '));
  }
  assert.equal(judge(ctx, id, 'close', '--position', `${SEC}=${secClaim}`, '--position', `${ARCH}=${archClaim}`).code, 0);
  assert.equal(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0], 'refused: no floor');
  assert.equal(judge(ctx, id, 'floor', '--to', SEC).lines[0], 'refused: council closed');
  // The decision.
  const rec = userRecord(ctx, 'Keep SQLite.');
  assert.deepEqual(say(ctx, id, SEC, 'decision', '--decision', 'Keep SQLite.', '--why', 'small', '--record', rec).lines, ['refused: not the user']);
  assert.deepEqual(say(ctx, id, 'user', 'decision', '--decision', 'Keep SQLite.', '--why', 'small').lines, ['refused: no approval']);
  assert.deepEqual(say(ctx, id, 'user', 'decision', '--decision', 'Keep Postgres.', '--why', 'small', '--record', rec).lines, ['refused: the text is not the record']);
  assert.equal(run(ctx, 'record', '--id', id).lines[0], 'refused: not decided');
  assert.equal(say(ctx, id, 'user', 'decision', '--decision', ' Keep SQLite. ', '--why', 'the load is small', '--record', rec).code, 0);
  assert.equal(say(ctx, id, 'user', 'decision', '--decision', 'Keep SQLite.', '--why', 'again', '--record', rec).lines[0], 'refused: council closed');

  const entry = run(ctx, 'record', '--id', id);
  assert.equal(entry.code, 0);
  const text = entry.lines.join('\n');
  for (const part of ['Which database for the new service?', `${SEC}: Use SQLite.`, `${ARCH}: Use Postgres.`, 'Decision: Keep SQLite.',
    'Why: the load is small', `Record: ${rec}`, 'one file, no server']) {
    assert.ok(text.includes(part), part);
  }
  const register = path.join(ctx.dir, 'register.md');
  assert.equal(run(ctx, 'record', '--id', id, '--register', register).code, 0);
  assert.equal(run(ctx, 'record', '--id', id, '--register', register).code, 0);
  assert.equal(fs.readFileSync(register, 'utf8').split('### Council').length, 3);
  assert.equal(run(ctx, 'record', '--id', id, '--register', path.join(ctx.dir, '.guilda', 'bus', 'x.md')).code, 2);
});

test('a lead with no claim closes with none', () => {
  const ctx = setup();
  const id = started(ctx, `${ARCH},${SEC}`);
  judge(ctx, id, 'floor', '--to', SEC);
  const c = JSON.parse(say(ctx, id, SEC, 'claim', ...claimArgs).lines[0]).id;
  assert.equal(judge(ctx, id, 'close', '--position', `${SEC}=${c}`, '--position', `${ARCH}=none`).code, 0);
  assert.deepEqual(raw(ctx, id).at(-1).positions, { [SEC]: c, [ARCH]: null });
});

// S5-35, the script part
test('S5-35: the claim of the user is the text of its record', () => {
  const ctx = setup();
  const id = started(ctx, `${ARCH},${SEC},user`);
  judge(ctx, id, 'floor', '--to', 'user');
  const rec = userRecord(ctx, 'Keep SQLite.');
  const ok = say(ctx, id, 'user', 'claim', '--claim', 'Keep SQLite.', '--record', rec);
  assert.equal(ok.code, 0);
  const last = raw(ctx, id).at(-1);
  assert.deepEqual([last.type, last.from, last.claim, last.record], ['claim', 'user', 'Keep SQLite.', rec]);
  judge(ctx, id, 'floor', '--to', 'user');
  assert.deepEqual(say(ctx, id, 'user', 'claim', '--claim', 'Use Postgres.', '--record', rec).lines, ['refused: the text is not the record']);
  const key = loadKey(ctx.dir, ctx.env);
  const forged = makeRecord({ session: 's1', kind: 'answer', text: 'Keep SQLite.', question: null }, key, () => Buffer.from('00000010', 'hex'));
  appendRecord(ctx.dir, { ...forged, text: 'Keep SQLite. and more' });
  assert.deepEqual(say(ctx, id, 'user', 'claim', '--claim', 'Keep SQLite. and more', '--record', forged.id).lines, ['refused: no approval']);
  assert.deepEqual(say(ctx, id, 'user', 'claim', '--claim', 'Keep SQLite.').lines, ['refused: no approval']);
  // The user needs the floor too.
  say(ctx, id, 'user', 'claim', '--claim', 'Keep SQLite.', '--record', rec);
  assert.deepEqual(say(ctx, id, 'user', 'claim', '--claim', 'Keep SQLite.', '--record', rec).lines, ['refused: no floor']);
});

// R34 and the bus
test('the channel is a bus file that no mailbox command reads', () => {
  const ctx = setup();
  const id = started(ctx);
  assert.deepEqual(mailboxAddresses(ctx.dir), []);
  assert.deepEqual(readMailbox(ctx.dir, id), []);
  const send = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'bus.mjs'), ctx.dir, 'send', '--from', 'main', '--to', id,
    '--type', 'request', '--text', 'x'], { encoding: 'utf8', env: ctx.env });
  assert.equal(send.status, 2);
  assert.equal(send.stdout, `unknown address ${id}\n`);
  assert.equal(raw(ctx, id).length, 2);
});

test('a council line is one JSON line with the fixed fields', () => {
  const ctx = setup();
  const id = started(ctx);
  const [create, open] = raw(ctx, id);
  for (const l of [create, open]) {
    assert.equal(l.v, 1);
    assert.equal(l.council, id);
    assert.match(l.id, /^c-[0-9a-f]{8}$/);
    assert.ok(!Number.isNaN(Date.parse(l.time)));
  }
  assert.deepEqual([create.from, open.from, open.type], ['architect', JUDGE, 'open']);
  assert.deepEqual(readLines(ctx.dir, id).length, 2);
});

test('appendLine under the lock keeps two writers in order', () => {
  const ctx = setup();
  const id = started(ctx);
  withMailboxLock(ctx.dir, id, () => appendLine(ctx.dir, id, { v: 1, id: 'c-00000001', council: id, from: 'x', type: 'note', time: 't' }));
  assert.equal(raw(ctx, id).at(-1).id, 'c-00000001');
});
