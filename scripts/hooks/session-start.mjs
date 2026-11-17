import fs from 'node:fs';
import path from 'node:path';
import { projectState, readProjectRules, SETUP_NOTICE } from '../lib/project.mjs';
import { contextRules } from '../lib/rules-context.mjs';
import { countViolations, ensureIgnored } from '../lib/violations.mjs';
import { compareSemver, installedVersion } from '../lib/version.mjs';
import { resolveProjectDir, resolvePluginRoot, runHookMain } from '../lib/hook-io.mjs';

const DIARY_LINES = 220;
const ESCALATION_THRESHOLD = 2;
const BROKEN_NOTICE_TAIL = 'guilda runs with safe defaults. Run guilda:init to fix .guilda/config.json.';
const MARKER_FILE = '.hooks-live.json';
const EXTENSION_MARKER_FILE = '.extension-live.json';
const EXTENSION_WAIT_MS = 300;
const EXTENSION_POLL_MS = 20;
// X2: the session line gives the queue script its --session value. Only a safe ID is printed.
const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
export const EXTENSION_NOTICE =
  'guilda: the extension plugin guilda-skills did not load. Its skills are off; the core laws are on. ' +
  'Check its two dependencies, skill-creator and superpowers, and their marketplaces.';

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
  return (
    `guilda updated ${configured} → ${installed}. The project layer works as it is. ` +
    'Run guilda:update to see the changes and to save the new version.'
  );
}

/** True when the extension marker parses and has this session ID. A missing file or a parse error is "not yet". */
function extensionLoaded(projectDir, sessionId) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(projectDir, '.guilda', EXTENSION_MARKER_FILE), 'utf8'));
    return Boolean(sessionId) && m !== null && m.sessionId === sessionId;
  } catch {
    return false;
  }
}

/** Read the extension marker every EXTENSION_POLL_MS until EXTENSION_WAIT_MS passed. */
async function waitForExtension(projectDir, sessionId) {
  const end = Date.now() + EXTENSION_WAIT_MS;
  while (true) {
    if (extensionLoaded(projectDir, sessionId)) return true;
    if (Date.now() >= end) return false;
    await new Promise((resolve) => setTimeout(resolve, EXTENSION_POLL_MS));
  }
}

/** Make the state files ignored by git. It never throws; false means the .gitignore could not be written. */
function ignoreStateFiles(projectDir) {
  try {
    ensureIgnored(path.join(projectDir, '.guilda'));
    return true;
  } catch {
    return false;
  }
}

/** Write the hooks marker. It never throws. */
function writeMarker(projectDir, sessionId, installed) {
  try {
    const dir = path.join(projectDir, '.guilda');
    const marker = { sessionId: sessionId ?? null, version: installed, at: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n');
  } catch {
    // A hook must never stop the context.
  }
}

function emit(additionalContext, systemMessage) {
  const out = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } };
  if (systemMessage) out.systemMessage = systemMessage;
  process.stdout.write(JSON.stringify(out));
}

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const pluginRoot = resolvePluginRoot();
  const project = projectState(projectDir);
  if (project.state === 'none') {
    // R28: no .guilda folder. Tell the model and the user once per session, write nothing.
    if (input.source === 'startup' || input.source === 'clear') {
      const out = {
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: SETUP_NOTICE },
        systemMessage: SETUP_NOTICE,
      };
      process.stdout.write(JSON.stringify(out));
    }
    return;
  }
  const { config } = project;
  const broken = project.state === 'broken';
  const fresh = input.source === 'startup' || input.source === 'clear';
  const installed = installedVersion(pluginRoot);
  const ignored = ignoreStateFiles(projectDir);
  let extensionNotice = '';
  if (fresh && !(await waitForExtension(projectDir, input.session_id))) extensionNotice = EXTENSION_NOTICE;
  const parts = [`guilda ${installed} active`];
  const root = pluginRoot.split(path.sep).join('/');
  parts.push(
    contextRules(readCore(pluginRoot, 'rules.md')),
    `Full rule blocks: ${root}/core/rules.md`,
    readCore(pluginRoot, 'writing.md'),
  );
  const projectRules = readProjectRules(projectDir).trim();
  if (projectRules) parts.push(projectRules);
  const t = config.tiers;
  parts.push(
    `Languages: replies ${config.languages.replies}, docs ${config.languages.docs}. ` +
      `Tiers: master ${t.master}, journeyman ${t.journeyman}, apprentice ${t.apprentice}.`,
    `Process: ${config.process}. Explain: ${config.explain}.`,
    `Diary command: node "${root}/scripts/journal-skeleton.mjs" <reason>`,
    `Glossary: ${root}/core/glossary.md`,
  );
  if (!broken) {
    const notice = versionNotice(installed, config.guildaVersion);
    if (notice) parts.push(notice);
  }
  if (fresh) {
    parts.push(...project.notices);
    if (broken) parts.push(`guilda: ${project.reason}. ${BROKEN_NOTICE_TAIL}`);
    if (extensionNotice) parts.push(extensionNotice);
  }
  for (const [rule, count] of countViolations(projectDir)) {
    if (count >= ESCALATION_THRESHOLD) {
      parts.push(`${rule}: ${count} violations — propose a stronger check (design 6.13)`);
    }
  }
  if (input.source === 'resume' || input.source === 'compact') {
    const diary = newestDiary(projectDir);
    if (diary) parts.push(diary);
  }
  if (typeof input.session_id === 'string' && SESSION_ID_RE.test(input.session_id)) {
    parts.push(`guilda session: ${input.session_id}`);
  }
  emit(parts.filter(Boolean).join('\n\n'), extensionNotice);
  if (ignored) writeMarker(projectDir, input.session_id, installed);
});
