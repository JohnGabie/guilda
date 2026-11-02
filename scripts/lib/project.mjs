import fs from 'node:fs';
import path from 'node:path';

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

/** Return the content of .guilda/rules.md, or "" when absent or unreadable. */
export function readProjectRules(projectDir) {
  try {
    return fs.readFileSync(path.join(projectDir, '.guilda', 'rules.md'), 'utf8');
  } catch {
    return '';
  }
}
