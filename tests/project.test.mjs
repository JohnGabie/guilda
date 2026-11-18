import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  loadConfig,
  readProjectRules,
  projectState,
  checkSchema,
  checkStrict,
  migrateConfig,
  normalizeRepo,
  projectHash,
  SAFE_DEFAULTS,
  SCHEMA_VERSION,
  busSettings,
  adapterSettings,
  linksOpen,
} from '../scripts/lib/project.mjs';
import { tempProject, MINIMAL_CONFIG, REPO_ROOT } from './helpers.mjs';

test('loadConfig returns null without config', () => {
  assert.equal(loadConfig(tempProject()), null);
});

test('loadConfig rejects invalid JSON with a reason', () => {
  const r = loadConfig(tempProject({ config: '{ not json' }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /not valid JSON/);
});

test('loadConfig rejects a missing tiers.master', () => {
  const config = structuredClone(MINIMAL_CONFIG);
  delete config.tiers.master;
  const r = loadConfig(tempProject({ config }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /tiers\.master/);
});

test('loadConfig accepts the minimal valid config', () => {
  const r = loadConfig(tempProject({ config: MINIMAL_CONFIG }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, MINIMAL_CONFIG);
});

test('loadConfig validates the optional scan.ignore', () => {
  const ok = loadConfig(tempProject({ config: { ...MINIMAL_CONFIG, scan: { ignore: ['tests/**'] } } }));
  assert.equal(ok.ok, true);
  const bad = loadConfig(tempProject({ config: { ...MINIMAL_CONFIG, scan: { ignore: 'x' } } }));
  assert.equal(bad.ok, false);
});

test('readProjectRules returns content or empty string', () => {
  assert.equal(readProjectRules(tempProject()), '');
  assert.equal(readProjectRules(tempProject({ rules: 'P1 rule\n' })), 'P1 rule\n');
});

test('config-check prints ok or the reason', () => {
  const script = path.join(REPO_ROOT, 'scripts', 'config-check.mjs');
  const good = spawnSync(process.execPath, [script, tempProject({ config: MINIMAL_CONFIG })], { encoding: 'utf8' });
  assert.equal(good.status, 0);
  assert.equal(good.stdout.trim(), 'ok');
  const bad = spawnSync(process.execPath, [script, tempProject({ config: '{' })], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /not valid JSON/);
});

test('projectState: no .guilda folder -> none', () => {
  assert.deepEqual(projectState(tempProject()), { state: 'none' });
});

test('projectState: .guilda is a file -> none', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, '.guilda'), 'not a directory');
  assert.deepEqual(projectState(dir), { state: 'none' });
});

test('projectState: .guilda without config.json -> broken, reason .guilda/config.json is missing, safe defaults', () => {
  const r = projectState(tempProject({ rules: '' }));
  assert.equal(r.state, 'broken');
  assert.equal(r.reason, '.guilda/config.json is missing');
  assert.deepEqual(r.config, SAFE_DEFAULTS);
});

test('projectState: invalid JSON -> broken', () => {
  const r = projectState(tempProject({ config: '{ not json' }));
  assert.equal(r.state, 'broken');
  assert.match(r.reason, /^\.guilda\/config\.json is not valid JSON: /);
  assert.deepEqual(r.config, SAFE_DEFAULTS);
});

test('projectState: JSON with no tiers -> broken', () => {
  const config = structuredClone(MINIMAL_CONFIG);
  delete config.tiers;
  const r = projectState(tempProject({ config }));
  assert.equal(r.state, 'broken');
  assert.match(r.reason, /tiers must be an object/);
  assert.deepEqual(r.config, SAFE_DEFAULTS);
});

test('projectState: valid config -> valid', () => {
  const r = projectState(tempProject({ config: MINIMAL_CONFIG }));
  assert.equal(r.state, 'valid');
  assert.deepEqual(r.config, { ...migrateConfig(MINIMAL_CONFIG), usage: { source: 'off' } });
  assert.deepEqual(r.notices, []);
});

const TIERS_JSON = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'core', 'tiers.json'), 'utf8'));
const invalidNotice = (field) =>
  `guilda: .guilda/config.json has an invalid ${field} value; guilda uses full. Run guilda:update.`;

test('a 0.1.x config reads process full, explain full and schemaVersion 2 (S18)', () => {
  const dir = tempProject({ config: MINIMAL_CONFIG });
  const file = path.join(dir, '.guilda', 'config.json');
  const before = fs.readFileSync(file);
  const r = projectState(dir);
  assert.equal(r.state, 'valid');
  assert.equal(r.config.process, 'full');
  assert.equal(r.config.explain, 'full');
  assert.equal(r.config.schemaVersion, 2);
  assert.equal(SCHEMA_VERSION, 2);
  assert.deepEqual(r.notices, []);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('process light stays light', () => {
  const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, process: 'light', explain: 'brief' } }));
  assert.equal(r.state, 'valid');
  assert.equal(r.config.process, 'light');
  assert.equal(r.config.explain, 'brief');
  assert.deepEqual(r.notices, []);
});

test('an invalid process reads as full with one notice', () => {
  for (const value of ['medium', 'Light', 1]) {
    const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, process: value } }));
    assert.equal(r.state, 'valid', `process ${JSON.stringify(value)}`);
    assert.equal(r.config.process, 'full');
    assert.deepEqual(r.notices, [invalidNotice('process')]);
  }
});

test('an invalid explain reads as full with one notice', () => {
  for (const value of ['loud', 'Brief', 1]) {
    const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, explain: value } }));
    assert.equal(r.state, 'valid', `explain ${JSON.stringify(value)}`);
    assert.equal(r.config.explain, 'full');
    assert.deepEqual(r.notices, [invalidNotice('explain')]);
  }
});

test('schemaVersion 99 is valid with the newer notice (S18)', () => {
  const r = projectState(tempProject({ config: { ...MINIMAL_CONFIG, schemaVersion: 99 } }));
  assert.equal(r.state, 'valid');
  assert.equal(r.config.schemaVersion, 99);
  assert.deepEqual(r.notices, [
    'guilda: .guilda/config.json has schemaVersion 99, newer than this guilda knows. Run guilda:update.',
  ]);
});

test('checkStrict refuses process medium, explain loud, report.repo "x", schemaVersion 0', () => {
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, process: 'medium' }), 'process must be light or full');
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, explain: 'loud' }), 'explain must be brief or full');
  assert.equal(
    checkStrict({ ...MINIMAL_CONFIG, report: { repo: 'x' } }),
    'report.repo must be owner/name or a GitHub URL',
  );
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, schemaVersion: 0 }), 'schemaVersion must be a positive integer');
});

test('checkStrict returns the checkSchema reason first', () => {
  const config = { ...MINIMAL_CONFIG, process: 'medium' };
  delete config.checks;
  assert.equal(checkStrict(config), checkSchema(config));
  assert.equal(checkStrict(config), 'checks must be an array');
});

test('checkStrict accepts a 0.1.x config', () => {
  assert.equal(checkStrict(MINIMAL_CONFIG), null);
  assert.equal(
    checkStrict({
      ...MINIMAL_CONFIG,
      process: 'light',
      explain: 'brief',
      schemaVersion: 2,
      report: { repo: 'https://github.com/acme/tools' },
    }),
    null,
  );
});

test('checkSchema still accepts process medium', () => {
  assert.equal(checkSchema({ ...MINIMAL_CONFIG, process: 'medium' }), null);
});

test('migrateConfig changes no other key and is safe to run again', () => {
  const c = structuredClone(MINIMAL_CONFIG);
  const once = migrateConfig(c);
  assert.deepEqual(c, MINIMAL_CONFIG);
  assert.notEqual(once, c);
  assert.deepEqual(migrateConfig(once), once);
  assert.deepEqual(Object.keys(once), [...Object.keys(MINIMAL_CONFIG), 'process', 'explain', 'schemaVersion']);
  for (const key of Object.keys(MINIMAL_CONFIG)) assert.deepEqual(once[key], MINIMAL_CONFIG[key]);
  assert.equal(once.process, 'full');
  assert.equal(once.explain, 'full');
  assert.equal(once.schemaVersion, 2);
  assert.equal(migrateConfig({ ...MINIMAL_CONFIG, schemaVersion: 1 }).schemaVersion, 2);
  assert.equal(migrateConfig({ ...MINIMAL_CONFIG, schemaVersion: 99 }).schemaVersion, 99);
  assert.equal(migrateConfig({ ...MINIMAL_CONFIG, process: 'light' }).process, 'light');
});

test('normalizeRepo', () => {
  for (const value of [
    'acme/tools',
    'https://github.com/acme/tools',
    'https://github.com/acme/tools/',
    'https://github.com/acme/tools.git',
  ]) {
    assert.equal(normalizeRepo(value), 'acme/tools', value);
  }
  for (const value of ['x', '', 'https://example.com/a/b']) assert.equal(normalizeRepo(value), null, value);
  for (const value of ['../..', 'a/.', 'a/..', '-x/-y', 'acme/-tools', '.acme/tools', 'https://github.com/../..']) {
    assert.equal(normalizeRepo(value), null, value);
  }
  assert.equal(normalizeRepo('acme/.github'), 'acme/.github');
});

test('the safe defaults are complete (S16)', () => {
  const r = projectState(tempProject({ config: '{ not json' }));
  assert.equal(r.state, 'broken');
  assert.deepEqual(r.notices, []);
  assert.deepEqual(r.config.tiers, TIERS_JSON);
  assert.equal(r.config.languages.replies, 'en');
  assert.equal(r.config.languages.docs, 'en');
  assert.equal(r.config.process, 'full');
  assert.equal(r.config.explain, 'full');
  assert.equal(r.config.security.enabled, true);
  assert.deepEqual(r.config.security.riskAreas, []);
  assert.deepEqual(r.config.scan, { ignore: [] });
  assert.deepEqual(r.config.writing, { free: [], exceptions: [] });
  assert.deepEqual(r.config.checks, []);
  assert.ok(Object.isFrozen(SAFE_DEFAULTS));
  assert.ok(Object.isFrozen(SAFE_DEFAULTS.tiers));
  assert.ok(Object.isFrozen(SAFE_DEFAULTS.security.riskAreas));
});

const BAD_SOURCE_NOTICE = 'guilda: .guilda/config.json has an invalid usage.source value; guilda uses off. Run guilda:update.';

test('usage source', () => {
  const read = (usage) => {
    const config = { ...structuredClone(MINIMAL_CONFIG) };
    if (usage !== undefined) config.usage = usage;
    const dir = tempProject({ config });
    const file = path.join(dir, '.guilda', 'config.json');
    const before = fs.readFileSync(file, 'utf8');
    const r = projectState(dir);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'no read changes the file');
    return r;
  };
  const a = read({ source: 'cswap' });
  assert.equal(a.config.usage.source, 'cswap');
  assert.ok(!a.notices.some((n) => n.includes('usage.source')));
  const b = read({ source: 'off' });
  assert.equal(b.config.usage.source, 'off');
  assert.ok(!b.notices.some((n) => n.includes('usage.source')));
  const c = read(undefined);
  assert.equal(c.config.usage.source, 'off');
  assert.ok(!c.notices.some((n) => n.includes('usage.source')));
  const d = read({ source: 7 });
  assert.equal(d.config.usage.source, 'off');
  assert.ok(d.notices.includes(BAD_SOURCE_NOTICE));
});

test('checkStrict refuses usage.source 7', () => {
  assert.equal(checkStrict({ ...structuredClone(MINIMAL_CONFIG), usage: { source: 7 } }), 'usage.source must be cswap or off');
  assert.equal(checkStrict({ ...structuredClone(MINIMAL_CONFIG), usage: { source: 'cswap' } }), null);
});

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('projectHash is equal in a worktree and in its main folder', () => {
  const dir = tempProject({ git: true });
  git(dir, 'commit', '--allow-empty', '-m', 'init');
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guilda wt ')), 'tree');
  git(dir, 'worktree', 'add', wt, '-b', 'side');
  const h = projectHash(dir);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(projectHash(wt), h);
});

test('projectHash with no git repository', () => {
  const dir = tempProject();
  const h = projectHash(dir);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(h, createHash('sha256').update(fs.realpathSync(dir)).digest('hex').slice(0, 16));
  assert.equal(projectHash(path.join(dir, 'missing')), null);
});

test('projectHash has 16 hex characters and no slash', () => {
  const h = projectHash(tempProject({ git: true }));
  assert.equal(h.length, 16);
  assert.ok(!h.includes('/'));
  assert.match(h, /^[0-9a-f]+$/);
});

test('checkStrict: dispatch.agentTypes is a list of non-empty strings', () => {
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, dispatch: { agentTypes: ['a', 'plugin:b'] } }), null);
  assert.equal(checkStrict({ ...MINIMAL_CONFIG, dispatch: {} }), null);
  for (const bad of [{ agentTypes: 'a' }, { agentTypes: [''] }, { agentTypes: [1] }, 'x']) {
    assert.equal(checkStrict({ ...MINIMAL_CONFIG, dispatch: bad }), 'dispatch.agentTypes must be a list of agent type names');
  }
});

test('dispatchAgentTypes reads a list in lower case and treats a bad value as empty', async () => {
  const { dispatchAgentTypes } = await import('../scripts/lib/project.mjs');
  assert.deepEqual(dispatchAgentTypes({ dispatch: { agentTypes: [' A ', 'b'] } }), ['a', 'b']);
  assert.deepEqual(dispatchAgentTypes({ dispatch: { agentTypes: ['a', '', 3] } }), []);
  for (const c of [{}, { dispatch: 'x' }, { dispatch: { agentTypes: 'a' } }, null]) assert.deepEqual(dispatchAgentTypes(c), []);
});

// 0.4.0 config keys (section 4m, D40).
const USER_NOTICE = 'bus.userChannels is invalid; only main counts';
const HOPS_NOTICE = 'bus.maxHops is invalid; using 8';
const LINK_VALUES = ['auto', 'kitty-overlay', 'kitty-window', 'zed', 'openidea', 'vscode', 'system'];
const withKeys = (extra) => ({ ...structuredClone(MINIMAL_CONFIG), ...extra });
const noticesOf = (extra) => projectState(tempProject({ config: withKeys(extra) })).notices;

test('bus settings: missing keys give main and 8', () => {
  assert.deepEqual(busSettings({}), { userChannels: ['main'], maxHops: 8 });
  const r = projectState(tempProject({ config: MINIMAL_CONFIG }));
  assert.deepEqual(r.notices, []);
  assert.deepEqual(busSettings(r.config), { userChannels: ['main'], maxHops: 8 });
});

test('bus.userChannels with another address reads main and gives one notice', () => {
  const config = withKeys({ bus: { userChannels: ['main', 'ext-codex-voice-4592'] } });
  assert.deepEqual(busSettings(config).userChannels, ['main']);
  assert.deepEqual(noticesOf({ bus: { userChannels: ['main', 'ext-codex-voice-4592'] } }), [USER_NOTICE]);
  assert.deepEqual(noticesOf({ bus: { userChannels: ['main'] } }), []);
});

test('bus.userChannels empty or not a list reads main with the notice', () => {
  for (const v of [[], 'main', null, 5, { main: 1 }]) {
    assert.deepEqual(busSettings({ bus: { userChannels: v } }).userChannels, ['main']);
    assert.deepEqual(noticesOf({ bus: { userChannels: v } }), [USER_NOTICE]);
  }
});

test('bus.maxHops 1 and 64 are valid; 0, 65, 2.5 and "8" read 8 with the notice', () => {
  for (const n of [1, 64]) {
    assert.equal(busSettings({ bus: { maxHops: n } }).maxHops, n);
    assert.deepEqual(noticesOf({ bus: { maxHops: n } }), []);
  }
  for (const v of [0, 65, 2.5, '8', null, -1, NaN]) {
    assert.equal(busSettings({ bus: { maxHops: v } }).maxHops, 8);
  }
  for (const v of [0, 65, 2.5, '8']) assert.deepEqual(noticesOf({ bus: { maxHops: v } }), [HOPS_NOTICE]);
});

test('adapter settings: only true enables an adapter', () => {
  assert.deepEqual(adapterSettings({}), { codex: { enabled: false }, peer: { enabled: false } });
  assert.deepEqual(adapterSettings({ adapters: { codex: { enabled: true }, peer: { enabled: true } } }), {
    codex: { enabled: true },
    peer: { enabled: true },
  });
  for (const v of ['true', 1, 'yes', null, [true]]) {
    assert.deepEqual(adapterSettings({ adapters: { codex: { enabled: v }, peer: { enabled: v } } }), {
      codex: { enabled: false },
      peer: { enabled: false },
    });
  }
  assert.deepEqual(noticesOf({ adapters: { peer: { enabled: 'true' } } }), []);
});

test('links.open: each of the seven values is read; an unknown value reads auto', () => {
  for (const v of LINK_VALUES) assert.equal(linksOpen({ links: { open: v } }), v);
  for (const v of ['emacs', '', 3, null, 'Zed']) assert.equal(linksOpen({ links: { open: v } }), 'auto');
  assert.equal(linksOpen({}), 'auto');
  assert.deepEqual(noticesOf({ links: { open: 'emacs' } }), []);
});

test('checkStrict refuses each invalid 0.4.0 key with its reason', () => {
  const cases = [
    [{ bus: { userChannels: ['main', 'x'] } }, USER_NOTICE],
    [{ bus: { userChannels: [] } }, USER_NOTICE],
    [{ bus: { userChannels: 'main' } }, USER_NOTICE],
    [{ bus: { maxHops: 0 } }, 'bus.maxHops must be an integer from 1 to 64'],
    [{ bus: { maxHops: 65 } }, 'bus.maxHops must be an integer from 1 to 64'],
    [{ bus: { maxHops: 2.5 } }, 'bus.maxHops must be an integer from 1 to 64'],
    [{ bus: { maxHops: '8' } }, 'bus.maxHops must be an integer from 1 to 64'],
    [{ adapters: { codex: { enabled: 'true' } } }, 'adapters.codex.enabled must be a boolean'],
    [{ adapters: { peer: { enabled: 1 } } }, 'adapters.peer.enabled must be a boolean'],
    [{ links: { open: 'emacs' } }, 'links.open must be one of auto, kitty-overlay, kitty-window, zed, openidea, vscode, system'],
    [{ bus: [] }, 'bus must be an object'],
    [{ adapters: 'x' }, 'adapters must be an object'],
    [{ links: null }, 'links must be an object'],
  ];
  for (const [extra, reason] of cases) assert.equal(checkStrict(withKeys(extra)), reason, JSON.stringify(extra));
  for (const v of [1, 64]) assert.equal(checkStrict(withKeys({ bus: { maxHops: v } })), null);
  for (const v of LINK_VALUES) assert.equal(checkStrict(withKeys({ links: { open: v } })), null);
});

test('checkStrict accepts a config with no 0.4.0 key', () => {
  assert.equal(checkStrict(structuredClone(MINIMAL_CONFIG)), null);
  assert.equal(checkStrict(withKeys({ bus: {}, adapters: {}, links: {} })), null);
  assert.equal(checkStrict(withKeys({ adapters: { codex: {}, peer: {} } })), null);
});

test('the readers never throw on null, a list or a string', () => {
  for (const v of [null, undefined, [], 'x', 5, { bus: null, adapters: [], links: 'x' }, { adapters: { codex: null, peer: 'x' } }]) {
    assert.doesNotThrow(() => busSettings(v));
    assert.doesNotThrow(() => adapterSettings(v));
    assert.doesNotThrow(() => linksOpen(v));
    assert.deepEqual(busSettings(v), { userChannels: ['main'], maxHops: 8 });
    assert.deepEqual(adapterSettings(v), { codex: { enabled: false }, peer: { enabled: false } });
    assert.equal(linksOpen(v), 'auto');
  }
});

test('the timeoutSec keys and an unknown key under bus, adapters or links are ignored', () => {
  const extra = {
    bus: { future: 1 },
    adapters: { codex: { enabled: true, timeoutSec: 'x', messageTimeoutSec: [] }, other: {} },
    links: { future: 1 },
  };
  assert.equal(checkStrict(withKeys(extra)), null);
  assert.deepEqual(noticesOf(extra), []);
  assert.equal(adapterSettings(withKeys(extra)).codex.enabled, true);
});

test('config-check prints the S4-36 reason and exits 1', () => {
  const script = path.join(REPO_ROOT, 'scripts', 'config-check.mjs');
  const dir = tempProject({ config: withKeys({ bus: { userChannels: ['main', 'ext-codex-voice-4592'] } }) });
  const r = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /bus\.userChannels is invalid; only main counts/);
});
