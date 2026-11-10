// Usage: node tally.mjs <labdir>  -> grades each run, prints per-arm stats and the running token total as JSON.
import fs from 'node:fs';
import path from 'node:path';
const lab = process.argv[2];
const dir = path.join(lab, 'partB', 'runs');
const { questions, review } = JSON.parse(fs.readFileSync(new URL('./questions.json', import.meta.url)));
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.meta')).sort()) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const base = path.join(dir, f.replace(/\.meta$/, ''));
  let j = null;
  const tools = []; let fullSpecReads = 0;
  try {
    for (const line of fs.readFileSync(base + '.jsonl', 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'result') j = ev;
      if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const c of ev.message.content) {
          if (c.type !== 'tool_use') continue;
          const inp = c.input || {};
          tools.push(c.name + ':' + (inp.command || inp.pattern || inp.file_path || '').toString().slice(0, 80) +
            (inp.offset || inp.limit ? `[${inp.offset || 0}+${inp.limit || ''}]` : ''));
          if (c.name === 'Read' && /specs\/.*design\.md$/.test(inp.file_path || '') && !inp.limit) fullSpecReads++;
        }
      }
    }
  } catch {}
  const u = { input: 0, cacheRead: 0, cacheCreate: 0, output: 0 };
  if (j && j.modelUsage) {
    for (const m of Object.values(j.modelUsage)) {
      u.input += m.inputTokens || 0; u.cacheRead += m.cacheReadInputTokens || 0;
      u.cacheCreate += m.cacheCreationInputTokens || 0; u.output += m.outputTokens || 0;
    }
  }
  const text = (j && j.result) || '';
  let correct = false; let answer = '';
  if (meta.id === 'R') {
    const m = text.match(/AFFECTED:\s*(.*)$/m);
    answer = m ? m[1].trim() : '';
    const got = new Set((answer.match(/T\d+/g) || []));
    correct = review.affected.every((t) => got.has(t)) && got.size === review.affected.length;
    meta.found = review.affected.filter((t) => got.has(t)).length;
    meta.extra = [...got].filter((t) => !review.affected.includes(t));
    meta.d99 = /D99/.test(text);
  } else {
    const q = questions.find((x) => x.id === meta.id);
    const m = text.match(/ANSWER:\s*(.*)$/m);
    answer = m ? m[1].replace(/\*\*/g, '').trim() : '';
    correct = !!m && q.all.every((p) => new RegExp(p, 'i').test(answer)) && !q.none.some((p) => new RegExp(p, 'i').test(answer));
  }
  rows.push({ ...meta, toolCalls: tools.length, fullSpecReads, tools, ok: !!j && !j.is_error && meta.exit === 0, turns: j ? j.num_turns : null, ...u,
    inTotal: u.input + u.cacheRead + u.cacheCreate, correct, answer });
}
const total = rows.reduce((s, r) => s + r.inTotal + r.output, 0);
const stat = (xs) => {
  const s = [...xs].sort((a, b) => a - b); const n = s.length;
  if (!n) return null;
  return { median: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, mean: Math.round(s.reduce((a, b) => a + b, 0) / n) };
};
const arms = {};
for (const arm of [1, 2]) {
  for (const kind of ['Q', 'R']) {
    const rs = rows.filter((r) => r.arm === arm && (kind === 'R' ? r.id === 'R' : r.id !== 'R'));
    if (!rs.length) continue;
    arms[`arm${arm}-${kind}`] = {
      runs: rs.length, correct: rs.filter((r) => r.correct).length,
      inTotal: stat(rs.map((r) => r.inTotal)), input: stat(rs.map((r) => r.input)), cacheRead: stat(rs.map((r) => r.cacheRead)),
      cacheCreate: stat(rs.map((r) => r.cacheCreate)), output: stat(rs.map((r) => r.output)), turns: stat(rs.map((r) => r.turns || 0)),
      wallMs: stat(rs.map((r) => r.wall_ms)), toolCalls: stat(rs.map((r) => r.toolCalls)),
      fullSpecReads: rs.reduce((s, r) => s + r.fullSpecReads, 0),
    };
  }
}
console.log(JSON.stringify({ totalTokens: total, arms, rows }, null, 1));
