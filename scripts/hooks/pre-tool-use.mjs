import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectState } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { scanText, globMatch } from '../lib/scan.mjs';
import { findGitCommits, parseAddedLines, resolveDir } from '../lib/git-command.mjs';
import { findCreatedFiles } from '../lib/shell-writes.mjs';

const PLANS_DIR = ['docs', 'superpowers', 'plans'];
const PLAN_SUFFIX = '.plan.md';
const R4_PROBLEMS = {
  plans: {
    action: 'new file refused in docs/superpowers/plans',
    reason: 'R4: plans are a "## Plan: Part N" section of the feature MD, or <feature>.plan.md next to it',
  },
  orphan: {
    action: 'orphan plan file refused',
    reason: 'R4: <name>.plan.md needs <name>.md in the same folder',
  },
};

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

// These options stop git config and attributes from changing the text or the file names of the diff.
const DIFF_ARGS = [
  '-U0',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--text',
  '--inter-hunk-context=0',
  '-O/dev/null',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

function git(args, { cwd, gitArgs = [], env = {} }) {
  // spawnSync throws on a NUL byte in an argument or in cwd. Treat that as a failed call; the session directory is
  // always a target too, so the scan does not stop there.
  try {
    return spawnSync('git', [...gitArgs, ...args], {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    return { error, status: null, stdout: '' };
  }
}

/**
 * Added lines of everything a commit can take. The index and the working tree can differ, so read both: the index
 * (--cached) and the tracked working-tree changes (HEAD, or the index when no commit exists yet).
 * Returns null outside a repository. Returns { failed: true } when git cannot read the diff in a repository.
 */
function commitAddedLines(call) {
  const repo = git(['rev-parse', '--git-dir'], call);
  if (repo.error || repo.status !== 0) return null;
  const hasHead = git(['rev-parse', '--verify', '--quiet', 'HEAD'], call).status === 0;
  const base = ['-c', 'core.quotepath=false', '-c', 'diff.relative=false', 'diff', ...DIFF_ARGS];
  const files = [];
  let readOne = false;
  for (const extra of [['--cached'], hasHead ? ['HEAD'] : []]) {
    const r = git([...base, ...extra], call);
    if (r.error && r.error.code === 'ENOBUFS') {
      process.stderr.write('guilda: commit scan skipped: the diff is larger than 64 MB\n');
      return { files: [] };
    }
    if (r.error || r.status !== 0) continue;
    readOne = true;
    files.push(...parseAddedLines(r.stdout || ''));
  }
  return readOne ? { files } : { failed: true };
}

/** The denial for one call, or null. `record` is true when the denial is a violation of R19. */
function checkCommit(call, config, startCwd) {
  const read = commitAddedLines(call);
  if (!read) return null;
  if (read.failed) {
    return { record: false, reason: `R19: the scan cannot read the diff in ${call.cwd} — fix the git error, then commit` };
  }
  const ignore = (config.scan && config.scan.ignore) || [];
  for (const { file, lines } of read.files) {
    if (ignore.some((g) => globMatch(g, file))) continue;
    for (const { line, text } of lines) {
      const [hit] = scanText(text);
      if (hit) {
        const where = call.cwd === startCwd ? '' : ` of ${call.cwd}`;
        return { record: true, reason: `R19: ${hit.kind} in ${file}:${line}${where} — remove it before commit` };
      }
    }
  }
  return null;
}

/** The places to scan. The session directory is always one, because the reader can lose track of `cd`. */
function scanTargets(found, startCwd, projectDir) {
  const targets = [...found.commits, { cwd: startCwd }];
  if (found.uncertain || found.commits.length === 0) targets.push({ cwd: projectDir });
  const seen = new Set();
  return targets.filter((t) => {
    const key = JSON.stringify([t.cwd, t.gitArgs ?? [], t.env ?? {}]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The R4 problem of a file that a tool is about to write: 'plans' for a new file inside docs/superpowers/plans/,
 * 'orphan' for a new <name>.plan.md whose folder has no <name>.md, else null. An existing file is never a problem.
 */
function planFileProblem(projectDir, absPath) {
  if (fs.existsSync(absPath)) return null;
  const rel = path.relative(path.join(projectDir, ...PLANS_DIR), absPath);
  if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return 'plans';
  const base = path.basename(absPath);
  if (!base.endsWith(PLAN_SUFFIX)) return null;
  const spec = path.join(path.dirname(absPath), `${base.slice(0, -PLAN_SUFFIX.length)}.md`);
  return fs.existsSync(spec) ? null : 'orphan';
}

/** The first R4 problem of the files that a shell command creates, from the project folder and from the command cwd. */
function commandPlanProblem(projectDir, command, startCwd) {
  for (const entry of findCreatedFiles(command, startCwd)) {
    for (const base of [projectDir, entry.cwd]) {
      const problem = planFileProblem(projectDir, resolveDir(base, entry.path));
      if (problem) return problem;
    }
  }
  return null;
}

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  // A broken project layer runs the laws with the safe defaults (D40). Only a project with no .guilda folder is skipped.
  const project = projectState(projectDir);
  if (project.state === 'none') return 0;

  const toolInput = input.tool_input || {};
  const record = (rule, action) =>
    appendViolation(projectDir, { rule, level: 'law', source: 'pre-tool-use', action });

  if (input.tool_name === 'Bash') {
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    const startCwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : projectDir;
    // R4 runs first: a command with no git commit returns early below.
    const planProblem = commandPlanProblem(projectDir, command, startCwd);
    if (planProblem) {
      record('R4', R4_PROBLEMS[planProblem].action);
      deny(R4_PROBLEMS[planProblem].reason);
      return 0;
    }
    const found = findGitCommits(command, startCwd);
    if (found.commits.length === 0 && !found.mentioned) return 0;
    // The hook runs before the command, so the scan cannot see what this command will stage.
    if (found.addBeforeCommit) {
      deny(`R19: run git ${found.indexChange} in its own command, then git commit, so that the scan can read the staged lines`);
      return 0;
    }
    for (const target of scanTargets(found, startCwd, projectDir)) {
      const denial = checkCommit(target, project.config, startCwd);
      if (denial) {
        // A command that only names a commit is refused as a precaution, and it is not a violation.
        if (denial.record && found.commits.length > 0) record('R19', 'git commit refused: staged secret or absolute path');
        deny(denial.reason);
        return 0;
      }
    }
    return 0;
  }

  if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
    const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
    const problem = filePath ? planFileProblem(projectDir, path.resolve(projectDir, filePath.replace(/\\/g, '/'))) : null;
    if (problem) {
      record('R4', R4_PROBLEMS[problem].action);
      deny(R4_PROBLEMS[problem].reason);
    }
  }
  return 0;
});
