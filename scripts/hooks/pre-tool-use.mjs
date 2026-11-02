import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { scanText, globMatch } from '../lib/scan.mjs';
import { findGitCommits, parseAddedLines } from '../lib/git-command.mjs';

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

// These options stop git config from changing the text or the file names of the diff.
const DIFF_ARGS = [
  '-U0',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--no-relative',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

function git(args, { cwd, gitArgs = [], env = {} }) {
  return spawnSync('git', [...gitArgs, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * Added lines of everything a commit can take. The index and the working tree can differ, so read both: the index
 * (--cached) and the tracked working-tree changes (HEAD, or the index when no commit exists yet).
 * Null when git fails on both reads.
 */
function commitAddedLines(call) {
  const hasHead = git(['rev-parse', '--verify', '--quiet', 'HEAD'], call).status === 0;
  const base = ['-c', 'core.quotepath=false', 'diff', ...DIFF_ARGS];
  const files = [];
  let readOne = false;
  for (const extra of [['--cached'], hasHead ? ['HEAD'] : []]) {
    const r = git([...base, ...extra], call);
    if (r.error || r.status !== 0) continue;
    readOne = true;
    files.push(...parseAddedLines(r.stdout || ''));
  }
  return readOne ? files : null;
}

function checkCommit(call, config) {
  const files = commitAddedLines(call);
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
    const { commits, addBeforeCommit } = findGitCommits(command, input.cwd || projectDir);
    if (commits.length === 0) return 0;
    // The hook runs before the command, so the scan cannot see what this `git add` will stage.
    if (addBeforeCommit) {
      deny('R19: run git add in its own command, then git commit, so that the scan can read the staged lines');
      return 0;
    }
    for (const call of commits) {
      const reason = checkCommit(call, loaded.config);
      if (reason) {
        record('R19', 'git commit refused: staged secret or absolute path');
        deny(reason);
        return 0;
      }
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
