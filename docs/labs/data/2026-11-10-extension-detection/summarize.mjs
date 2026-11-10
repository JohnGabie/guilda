import fs from 'node:fs';
import path from 'node:path';
const L = path.dirname(new URL(import.meta.url).pathname);
const rows = [];
for (const d of fs.readdirSync(path.join(L, 'logs')).filter((d) => /^(both|core|stress|stale|direct)/.test(d)).sort()) {
  const dir = path.join(L, 'logs', d);
  const rd = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const core = rd('core.jsonl').trim().split('\n').filter(Boolean).map(JSON.parse);
  const ext = rd('ext.jsonl').trim().split('\n').filter(Boolean).map(JSON.parse);
  const run = JSON.parse(rd('run.json') || '{}');
  const init = rd('stream.jsonl').split('\n').filter((l) => l.includes('"subtype":"init"')).map(JSON.parse)[0] || {};
  const result = rd('stream.jsonl').split('\n').filter((l) => l.includes('"type":"result"')).map(JSON.parse)[0] || {};
  const c = core[0] || {}, e = ext[0] || {};
  const cfg = rd('config-new-files.txt').split('\n').filter((l) => /l4core|l4ext|extension-live/i.test(l));
  rows.push({
    run: d, rc: run.rc, wallMs: run.wallMs, coreRuns: core.length, extRuns: ext.length,
    sameSession: !e.session || e.session === c.session,
    A: c.methodA?.answer, A_first: c.methodA?.firstRead, A_ms: c.methodA?.ms, A_polls: c.methodA?.polls,
    B: c.methodB?.answer, B_ms: c.methodB?.ms, B_err: c.methodB?.err,
    coreStart: c.start && +(c.start - run.t0).toFixed(0), coreEnd: c.end && +(c.end - run.t0).toFixed(0),
    extStart: e.start && +(e.start - run.t0).toFixed(0), extEnd: e.end && +(e.end - run.t0).toFixed(0),
    extFirst: e.start ? (e.start < c.start ? 'ext' : 'core') : '-',
    plugins: (init.plugins || []).map((p) => p.source).join(' '),
    result: result.result, gitStatus: rd('git-status.txt').trim().replace(/\n/g, '; '),
    files: rd('project-files.txt').trim().split('\n').join(' '), cfgL4: cfg.length, cfgNew: rd('config-new-files.txt').trim().split('\n').filter(Boolean).length,
  });
}
console.log(JSON.stringify(rows, null, 1));
