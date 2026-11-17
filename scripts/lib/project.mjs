import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** The schemaVersion of a 0.2.0 config. A config with no schemaVersion is version 1 (0.1.x). */
export const SCHEMA_VERSION = 2;

/** The R28 notice for a project with no .guilda folder. */
export const SETUP_NOTICE =
  'guilda is installed but not set up in this project. If you just installed it, reload; then run guilda:init. Without it guilda does not work.';

const PROCESS_LEVELS = ['light', 'full'];
const EXPLAIN_LEVELS = ['brief', 'full'];
const FAIL_CLOSED_LEVEL = 'full';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isString = (v) => typeof v === 'string';
const isNonEmptyString = (v) => isString(v) && v.trim() !== '';
const isStringArray = (v) => Array.isArray(v) && v.every(isString);

/** Return a reason string when the config is invalid, or null when it is valid. */
export function checkSchema(c) {
  if (!isObject(c)) return 'config must be a JSON object';
  if (!isString(c.guildaVersion) || !SEMVER.test(c.guildaVersion)) {
    return 'guildaVersion must be a semver string';
  }
  if (!isObject(c.languages)) return 'languages must be an object';
  for (const key of ['replies', 'docs']) {
    if (!isNonEmptyString(c.languages[key])) return `languages.${key} must be a non-empty string`;
  }
  if (!isObject(c.tiers)) return 'tiers must be an object';
  for (const key of ['master', 'journeyman', 'apprentice']) {
    if (!isNonEmptyString(c.tiers[key])) return `tiers.${key} must be a non-empty string`;
  }
  if (!isObject(c.writing)) return 'writing must be an object';
  if (!isStringArray(c.writing.free)) return 'writing.free must be an array of strings';
  if (!Array.isArray(c.writing.exceptions)) return 'writing.exceptions must be an array';
  for (const [i, e] of c.writing.exceptions.entries()) {
    if (!isObject(e)) return `writing.exceptions[${i}] must be an object`;
    for (const key of ['docType', 'level', 'reason']) {
      if (!isString(e[key])) return `writing.exceptions[${i}].${key} must be a string`;
    }
  }
  if (!isObject(c.security)) return 'security must be an object';
  if (typeof c.security.enabled !== 'boolean') return 'security.enabled must be a boolean';
  if (!isStringArray(c.security.riskAreas)) return 'security.riskAreas must be an array of strings';
  if (!Array.isArray(c.checks)) return 'checks must be an array';
  for (const [i, k] of c.checks.entries()) {
    if (!isObject(k)) return `checks[${i}] must be an object`;
    for (const key of ['name', 'command']) {
      if (!isNonEmptyString(k[key])) return `checks[${i}].${key} must be a non-empty string`;
    }
  }
  if (c.scan !== undefined) {
    if (!isObject(c.scan)) return 'scan must be an object';
    if (!isStringArray(c.scan.ignore)) return 'scan.ignore must be an array of strings';
  }
  return null;
}

/**
 * Load and validate .guilda/config.json.
 * Returns null when the file does not exist.
 */
export function loadConfig(projectDir) {
  const file = path.join(projectDir, '.guilda', 'config.json');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    return { ok: false, reason: `cannot read .guilda/config.json: ${err.message}` };
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: `.guilda/config.json is not valid JSON: ${err.message}` };
  }
  const problem = checkSchema(config);
  if (problem) return { ok: false, reason: `.guilda/config.json is invalid: ${problem}` };
  return { ok: true, config };
}

// An owner starts with a letter or digit. A name does not start with '-' and is not '.' or '..', so the value
// cannot climb a path or read as a command flag.
const OWNER = '[A-Za-z0-9][A-Za-z0-9_.-]*';
const NAME = '(?!\\.\\.?(?:$|\\/|\\.git))[A-Za-z0-9_.][A-Za-z0-9_.-]*';
const REPO_NAME = new RegExp(`^${OWNER}\\/${NAME}$`);
const GITHUB_URL = new RegExp(`^https:\\/\\/github\\.com\\/(${OWNER})\\/(${NAME}?)(?:\\.git)?\\/?$`);

/** Return 'owner/name' for owner/name or a https://github.com/owner/name URL, or null. */
export function normalizeRepo(value) {
  if (!isString(value)) return null;
  const v = value.trim();
  if (REPO_NAME.test(v) && !v.endsWith('.git')) return v;
  const m = v.match(GITHUB_URL);
  if (m && !m[2].endsWith('.git')) return `${m[1]}/${m[2]}`;
  return null;
}

/**
 * The strict check of config-write and config-check (D40). Return a reason string when the config is invalid,
 * or null when it is valid. It runs checkSchema, then it checks the defaulted fields. A missing defaulted field
 * is valid.
 */
export function checkStrict(c) {
  const problem = checkSchema(c);
  if (problem) return problem;
  if (c.process !== undefined && !PROCESS_LEVELS.includes(c.process)) return 'process must be light or full';
  if (c.explain !== undefined && !EXPLAIN_LEVELS.includes(c.explain)) return 'explain must be brief or full';
  if (c.report !== undefined) {
    if (!isObject(c.report) || (c.report.repo !== undefined && normalizeRepo(c.report.repo) === null)) {
      return 'report.repo must be owner/name or a GitHub URL';
    }
  }
  if (c.usage !== undefined && isObject(c.usage) && c.usage.source !== undefined && !USAGE_SOURCES.includes(c.usage.source)) {
    return 'usage.source must be cswap or off';
  }
  if (c.schemaVersion !== undefined && !(Number.isInteger(c.schemaVersion) && c.schemaVersion > 0)) {
    return 'schemaVersion must be a positive integer';
  }
  if (c.dispatch !== undefined) {
    const types = isObject(c.dispatch) ? c.dispatch.agentTypes : null;
    if (!isObject(c.dispatch) || (types !== undefined && !(Array.isArray(types) && types.every((t) => isString(t) && t.trim() !== '')))) {
      return 'dispatch.agentTypes must be a list of agent type names';
    }
  }
  return null;
}

/**
 * The extra agent types that the main session may dispatch (ARC4), from dispatch.agentTypes, trimmed and in lower
 * case. A missing or bad value reads as an empty list (tolerant reader). Never throws.
 */
export function dispatchAgentTypes(config) {
  const types = isObject(config) && isObject(config.dispatch) ? config.dispatch.agentTypes : undefined;
  // A list with any bad item reads as empty, as the strict check refuses it (fail closed).
  if (!Array.isArray(types) || !types.every((t) => isString(t) && t.trim() !== '')) return [];
  return types.map((t) => t.trim().toLowerCase());
}

/**
 * Run the migrations from schemaVersion 1 to 2 in memory. Return a new object; the argument does not change.
 * A missing process or explain becomes full, and a schemaVersion that is missing or lower than 2 becomes 2.
 * No other key changes, and the new keys come last. Safe to run again.
 */
export function migrateConfig(config) {
  const out = { ...config };
  if (out.process === undefined) out.process = FAIL_CLOSED_LEVEL;
  if (out.explain === undefined) out.explain = FAIL_CLOSED_LEVEL;
  if (out.schemaVersion === undefined || (typeof out.schemaVersion === 'number' && out.schemaVersion < SCHEMA_VERSION)) {
    out.schemaVersion = SCHEMA_VERSION;
  }
  return out;
}

const deepFreeze = (v) => {
  if (v !== null && typeof v === 'object') {
    for (const child of Object.values(v)) deepFreeze(child);
    Object.freeze(v);
  }
  return v;
};

/** Read core/tiers.json of the plugin. Never throws; an unreadable file gives {}. */
function defaultTiers() {
  try {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', 'tiers.json');
    const tiers = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isObject(tiers) ? tiers : {};
  } catch {
    return {};
  }
}

/** The config a law hook uses when the project layer is broken (D40, section 3d). */
export const SAFE_DEFAULTS = deepFreeze({
  tiers: defaultTiers(),
  languages: { replies: 'en', docs: 'en' },
  process: FAIL_CLOSED_LEVEL,
  explain: FAIL_CLOSED_LEVEL,
  security: { enabled: true, riskAreas: [] },
  scan: { ignore: [] },
  writing: { free: [], exceptions: [] },
  checks: [],
});

const MISSING_CONFIG = '.guilda/config.json is missing';

/** Return true when <projectDir>/.guilda is a directory. Never throws. */
function hasGuildaDir(projectDir) {
  try {
    return fs.statSync(path.join(projectDir, '.guilda')).isDirectory();
  } catch {
    return false;
  }
}

const USAGE_SOURCES = ['cswap', 'off'];
const invalidSourceNotice = () =>
  'guilda: .guilda/config.json has an invalid usage.source value; guilda uses off. Run guilda:update.';

const invalidLevelNotice = (field) =>
  `guilda: .guilda/config.json has an invalid ${field} value; guilda uses ${FAIL_CLOSED_LEVEL}. Run guilda:update.`;
const newerSchemaNotice = (n) =>
  `guilda: .guilda/config.json has schemaVersion ${n}, newer than this guilda knows. Run guilda:update.`;

/** Migrate a config that passed checkSchema, and fail closed on an invalid process or explain. */
function readValid(loaded) {
  const config = migrateConfig(loaded);
  const notices = [];
  if (!PROCESS_LEVELS.includes(config.process)) {
    config.process = FAIL_CLOSED_LEVEL;
    notices.push(invalidLevelNotice('process'));
  }
  if (!EXPLAIN_LEVELS.includes(config.explain)) {
    config.explain = FAIL_CLOSED_LEVEL;
    notices.push(invalidLevelNotice('explain'));
  }
  const source = isObject(config.usage) ? config.usage.source : undefined;
  if (source !== undefined && !USAGE_SOURCES.includes(source)) notices.push(invalidSourceNotice());
  config.usage = { ...(isObject(config.usage) ? config.usage : {}), source: USAGE_SOURCES.includes(source) ? source : 'off' };
  if (typeof config.schemaVersion === 'number' && config.schemaVersion > SCHEMA_VERSION) {
    notices.push(newerSchemaNotice(config.schemaVersion));
  }
  return { state: 'valid', config, notices };
}

/**
 * Tell the state of the project layer (D40, section 3d). Never throws and never writes.
 * { state: 'none' } without a .guilda folder;
 * { state: 'broken', reason, config: SAFE_DEFAULTS, notices: [] } when the folder exists and the config is missing
 * or fails checkSchema;
 * { state: 'valid', config, notices } otherwise. The config is migrated in memory; an invalid process or explain
 * reads as full with one notice, and a schemaVersion newer than SCHEMA_VERSION gives one notice.
 */
export function projectState(projectDir) {
  const broken = (reason) => ({ state: 'broken', reason, config: SAFE_DEFAULTS, notices: [] });
  try {
    if (!hasGuildaDir(projectDir)) return { state: 'none' };
    const loaded = loadConfig(projectDir);
    if (loaded === null) return broken(MISSING_CONFIG);
    if (!loaded.ok) return broken(loaded.reason);
    return readValid(loaded.config);
  } catch (err) {
    return broken(`cannot read .guilda/config.json: ${err && err.message}`);
  }
}

/** Return the content of .guilda/rules.md, or "" when absent or unreadable. */
export function readProjectRules(projectDir) {
  try {
    return fs.readFileSync(path.join(projectDir, '.guilda', 'rules.md'), 'utf8');
  } catch {
    return '';
  }
}

/**
 * The project hash of X9: the first 16 hex characters of SHA-256 of the real path of the main project root.
 * The main root is the parent of the git common directory; with no repository it is the real path of projectDir.
 * Returns null when the root cannot be found. Never throws.
 */
export function projectHash(projectDir) {
  try {
    let root = fs.realpathSync(projectDir);
    const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) root = fs.realpathSync(path.dirname(r.stdout.trim()));
    return createHash('sha256').update(root).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}
