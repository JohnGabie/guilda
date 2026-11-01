import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { scanText, globMatch } from '../lib/scan.mjs';

const PLANS_DIR = ['docs', 'superpowers', 'plans'];

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
}

const QUOTED_OR_WORD = `(?:"[^"]*"|'[^']*'|\\S+)`;
const GIT_OPT = `(?:-C\\s+${QUOTED_OR_WORD}|-c\\s+${QUOTED_OR_WORD}|--[\\w-]+(?:=\\S+)?|-\\S+)`;
const GIT_COMMIT = new RegExp(`\\bgit\\b((?:\\s+${GIT_OPT})*)\\s+commit\\b`);

function git(args, cwd) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** The directory git runs in: the project dir moved by each `-C <dir>` option, in order. */
function gitCwd(projectDir, options) {
  let cwd = projectDir;
  for (const m of options.matchAll(new RegExp(`-C\\s+(${QUOTED_OR_WORD})`, 'g'))) {
    cwd = path.resolve(cwd, m[1].replace(/^["']|["']$/g, ''));
  }
  return cwd;
}

/**
 * Added lines of everything a commit can take: the index plus tracked working-tree changes
 * (git diff HEAD), or the index alone when no commit exists yet. Null on any git error.
 */
function stagedAddedLines(cwd) {
  const hasHead = git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd).status === 0;
  const base = ['-c', 'core.quotepath=false', 'diff'];
  const r = git(
    hasHead ? [...base, 'HEAD', '-U0', '--no-color'] : [...base, '--cached', '-U0', '--no-color'],
    cwd,
  );
  if (r.error || r.status !== 0) return null;
  const files = [];
  let current = null;
  let lineNo = 0;
  for (const raw of (r.stdout || '').split('\n')) {
    if (raw.startsWith('+++ ')) {
      const name = raw.slice(4).replace(/\t.*$/, '');
      current = name === '/dev/null' ? null : { file: name.replace(/^b\//, ''), lines: [] };
      if (current) files.push(current);
    } else if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw);
      lineNo = m ? Number(m[1]) : 0;
    } else if (current && raw.startsWith('+')) {
      current.lines.push({ line: lineNo++, text: raw.slice(1) });
    }
  }
  return files;
}

function checkCommit(cwd, config) {
  const files = stagedAddedLines(cwd);
  if (!files) return null;
  const ignore = (config.scan && config.scan.ignore) || [];
  for (const { file, lines } of files) {
    if (ignore.some((g) => globMatch(g, file))) continue;
    for (const { line, text } of lines) {
      const [hit] = scanText(text);
      if (hit) return `R19: ${hit.kind} in ${file}:${line} — remove it before commit`;
    }
  }
  return null;
}

function isNewPlanFile(projectDir, filePath) {
  const abs = path.resolve(projectDir, filePath.replace(/\\/g, '/'));
  const rel = path.relative(path.join(projectDir, ...PLANS_DIR), abs);
  const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  return inside && !fs.existsSync(abs);
}

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const loaded = loadConfig(projectDir);
  if (!loaded || !loaded.ok) return 0;

  const toolInput = input.tool_input || {};
  const record = (rule, action) =>
    appendViolation(projectDir, { rule, level: 'law', source: 'pre-tool-use', action });

  if (input.tool_name === 'Bash') {
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    const match = GIT_COMMIT.exec(command);
    if (!match) return 0;
    const reason = checkCommit(gitCwd(projectDir, match[1]), loaded.config);
    if (reason) {
      record('R19', 'git commit refused: staged secret or absolute path');
      deny(reason);
    }
    return 0;
  }

  if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
    const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
    if (filePath && isNewPlanFile(projectDir, filePath)) {
      record('R4', 'new file refused in docs/superpowers/plans');
      deny('R4: plans are a "## Plan: Part N" section of the feature MD');
    }
  }
  return 0;
});
