import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const MINIMAL_CONFIG = {
  guildaVersion: '0.1.0',
  languages: { replies: 'en', docs: 'en' },
  tiers: { master: 'opus', journeyman: 'sonnet', apprentice: 'haiku' },
  writing: { free: [], exceptions: [] },
  security: { enabled: false, riskAreas: [] },
  checks: [],
};

/** Make a temp project dir (name has a space). Never removed. */
export function tempProject({ config, rules, git } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilda test '));
  if (config !== undefined || rules !== undefined) {
    fs.mkdirSync(path.join(dir, '.guilda'), { recursive: true });
  }
  if (config !== undefined) {
    const text = typeof config === 'string' ? config : JSON.stringify(config, null, 2);
    fs.writeFileSync(path.join(dir, '.guilda', 'config.json'), text);
  }
  if (rules !== undefined) fs.writeFileSync(path.join(dir, '.guilda', 'rules.md'), rules);
  if (git) {
    spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.name', 'Guilda Test'], { cwd: dir, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  }
  return dir;
}

/** Run a hook script (path relative to the repository root) with JSON on stdin. */
export function runHook(script, input, projectDir) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, script)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: projectDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_ROOT: REPO_ROOT },
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
