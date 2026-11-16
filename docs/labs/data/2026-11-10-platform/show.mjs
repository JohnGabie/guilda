// Usage: node show.mjs <run.jsonl> — print the init plugins, skills, slash commands, hook events, tool calls, result.
import fs from 'node:fs';
import os from 'node:os';
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
for (const e of lines) {
  if (e.type === 'system' && e.subtype === 'init') {
    console.log('session_id:', e.session_id);
    console.log('plugins:', JSON.stringify((e.plugins || []).map((p) => p.name + (p.path && p.path.startsWith(os.tmpdir()) ? '@tmp' : ''))));
    console.log('skills(l6/guilda):', JSON.stringify((e.skills || []).filter((s) => /l6|guilda/.test(s))));
    console.log('slash(l6/guilda):', JSON.stringify((e.slash_commands || []).filter((s) => /l6|guilda/.test(s))));
  } else if (e.type === 'system' && /hook/.test(e.subtype || '')) {
    console.log('hook:', e.subtype, e.hook_name || e.hook_event || '', (e.output || e.stdout || '').slice(0, 300).replace(/\n/g, ' | '));
  } else if (e.type === 'assistant') {
    for (const c of e.message.content || []) if (c.type === 'tool_use') console.log('tool_use:', c.name, JSON.stringify(c.input).slice(0, 200));
  } else if (e.type === 'result') {
    console.log('result:', JSON.stringify(e.result).slice(0, 400), 'turns', e.num_turns, 'cost', e.total_cost_usd);
  } else if (e.type === 'system') {
    console.log('system:', e.subtype, JSON.stringify(e).slice(0, 300));
  }
}
