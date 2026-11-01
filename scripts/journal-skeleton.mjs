import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const MARKER = '<!-- TODO-CONTEXT -->';

const SECTIONS = [
  'Goal and current phase',
  'Decisions made and why (include rejected options)',
  'User preferences and corrections (verbatim where possible)',
  'Done and verified (with evidence: command, output or commit)',
  'In progress (branches, background tasks and their IDs, files being edited)',
  'Next steps, in order',
  'Open questions for the user',
  'Pitfalls and commands that worked or failed',
  'Files to re-read first after compaction',
  'Do NOT redo (already done or already decided)',
  'What to promote to durable docs (list each item and say if it is done)',
];

function git(projectDir, args) {
  const r = spawnSync('git', args, {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

const pad = (n) => String(n).padStart(2, '0');

function stamps(d) {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { day, time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` };
}

/** Create a diary skeleton in <projectDir>/.journal and return its path. */
export function createSkeleton(projectDir, reason = 'manual') {
  const safeReason = String(reason).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'manual';
  const now = new Date();
  const { day, time } = stamps(now);
  const dir = path.join(projectDir, '.journal');
  fs.mkdirSync(dir, { recursive: true });

  const branch = git(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = git(projectDir, ['status', '--short']);
  const log = git(projectDir, ['log', '--oneline', '-n', '5']);
  const lines = [
    `# Context diary — ${day} ${time.slice(0, 2)}:${time.slice(2, 4)} — ${safeReason}`,
    '',
    '## Facts collected automatically',
    `- Branch: ${branch ?? 'not a git repository'}`,
    '- Working tree (git status --short):',
    '```',
    status ?? '',
    '```',
    '- Last 5 commits:',
    '```',
    log ?? '',
    '```',
    '',
    `## Context (fill every section, then remove every ${MARKER} marker)`,
    ...SECTIONS.map((s, i) => `### ${i + 1}. ${s}  ${MARKER}`),
    '',
  ];

  for (let n = 0; ; n += 1) {
    const suffix = n === 0 ? '' : `-${n + 1}`;
    const file = path.join(dir, `${day}-${time}-${safeReason}${suffix}.md`);
    try {
      fs.writeFileSync(file, lines.join('\n'), { flag: 'wx' });
      return file;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    process.stdout.write(createSkeleton(projectDir, process.argv[2]) + '\n');
  } catch (err) {
    process.stderr.write(`guilda: ${String(err.message).split('\n')[0]}\n`);
    process.exitCode = 1;
  }
}
