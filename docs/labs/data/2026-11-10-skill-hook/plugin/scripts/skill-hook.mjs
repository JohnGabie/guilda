// Lab hook: log the raw standard input of each PreToolUse Skill call, deny the skill "blocked".
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
const logDir = process.env.SKHLAB_LOG_DIR || join(root, 'log');
mkdirSync(logDir, { recursive: true });
appendFileSync(join(logDir, 'hook-input.jsonl'), raw.trim() + '\n');
let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }
const skill = String(input.tool_input?.skill ?? '');
if (skill.endsWith('blocked')) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'LAB-DENY-K1: the lab hook refused the skill ' + skill,
    },
  }) + '\n');
}
process.exit(0);
