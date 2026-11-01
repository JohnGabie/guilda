import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, readProjectRules } from '../lib/project.mjs';
import { countViolations } from '../lib/violations.mjs';
import { compareSemver, installedVersion } from '../lib/version.mjs';

const DIARY_LINES = 220;
const ESCALATION_THRESHOLD = 2;

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function readCore(root, name) {
  try {
    return fs.readFileSync(path.join(root, 'core', name), 'utf8').trim();
  } catch {
    return '';
  }
}

function newestDiary(projectDir) {
  try {
    const dir = path.join(projectDir, '.journal');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    if (files.length === 0) return '';
    const text = fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8');
    return text.split('\n').slice(0, DIARY_LINES).join('\n').trim();
  } catch {
    return '';
  }
}

function versionNotice(installed, configured) {
  if (compareSemver(installed, configured) <= 0) return '';
  const majorUp = parseInt(installed, 10) > parseInt(configured, 10);
  return majorUp
    ? `guilda updated ${configured} → ${installed}; guilda:init is required`
    : `guilda updated ${configured} → ${installed}; run guilda:init to review the project layer`;
}

function emit(additionalContext) {
  const out = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } };
  process.stdout.write(JSON.stringify(out));
}

try {
  const input = readStdin();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const pluginRoot =
    process.env.CLAUDE_PLUGIN_ROOT ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const loaded = loadConfig(projectDir);
  if (loaded === null) {
    // Not a guilda project: print nothing.
  } else if (!loaded.ok) {
    emit(`guilda: ${loaded.reason}`);
  } else {
    const { config } = loaded;
    const installed = installedVersion(pluginRoot);
    const parts = [`guilda ${installed} active`];
    parts.push(readCore(pluginRoot, 'rules.md'), readCore(pluginRoot, 'writing.md'));
    const projectRules = readProjectRules(projectDir).trim();
    if (projectRules) parts.push(projectRules);
    const t = config.tiers;
    parts.push(
      `Languages: replies ${config.languages.replies}, docs ${config.languages.docs}. ` +
        `Tiers: master ${t.master}, journeyman ${t.journeyman}, apprentice ${t.apprentice}.`,
    );
    const root = pluginRoot.split(path.sep).join('/');
    parts.push(`Diary command: node "${root}/scripts/journal-skeleton.mjs" <reason>`);
    parts.push(`Glossary: ${root}/core/glossary.md`);
    const notice = versionNotice(installed, config.guildaVersion);
    if (notice) parts.push(notice);
    for (const [rule, count] of countViolations(projectDir)) {
      if (count >= ESCALATION_THRESHOLD) {
        parts.push(`${rule}: ${count} violations — propose a stronger check (design 6.13)`);
      }
    }
    if (input.source === 'resume' || input.source === 'compact') {
      const diary = newestDiary(projectDir);
      if (diary) parts.push(diary);
    }
    emit(parts.filter(Boolean).join('\n\n'));
  }
} catch (err) {
  process.stderr.write(`guilda: ${err && err.message ? err.message : 'session-start failed'}\n`);
}
process.exit(0);
