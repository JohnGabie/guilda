import fs from 'node:fs';
import path from 'node:path';

/** The role groups of D43. A skill may also have the one value `shared`. */
export const GROUPS = ['architect', 'engineering', 'lab', 'security', 'ai', 'council'];

/** The group of the main session, which has no agent definition (section 3e). */
export const MAIN_SESSION_GROUPS = ['architect'];

/** The skill value that every group may load. */
export const SHARED = 'shared';

/** The plugin prefix of each guilda skill and the folder of its skills under the core plugin root. */
const SKILL_DIRS = {
  guilda: ['skills'],
  'guilda-skills': ['plugins', 'guilda-skills', 'skills'],
};

/** The plugin prefix of each guilda agent. */
const AGENT_PLUGIN = 'guilda';

/** A skill or agent name that is safe as one path part: no slash, no dot path, no space, no upper case. */
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The frontmatter of a file, or null when the file is missing, not readable or has none. */
function frontmatter(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---(\n|$)/);
  return m ? m[1] : null;
}

/**
 * The values of one top-level frontmatter field: a flow list `[a, b]` -> ['a', 'b'], a scalar `a` -> 'a'.
 * Returns undefined when the field is absent, and null when it appears more than once or is not one of the forms.
 */
function field(front, name) {
  const lines = front.split('\n').filter((l) => l.startsWith(`${name}:`));
  if (lines.length === 0) return undefined;
  if (lines.length > 1) return null;
  const raw = lines[0].slice(name.length + 1).replace(/\s+#.*$/, '').trim();
  const unquote = (v) => v.trim().replace(/^(['"])(.*)\1$/, '$2');
  const list = raw.match(/^\[(.*)\]$/);
  if (list) {
    if (list[1].trim() === '') return [];
    return list[1].split(',').map(unquote);
  }
  if (raw === '' || /[[\]{},]/.test(raw)) return null;
  return unquote(raw);
}

const allGroups = (values) => values.length > 0 && values.every((v) => GROUPS.includes(v));

/**
 * The role groups of an agent, or null. No agent type is the main session: ['architect'].
 * `guilda:<name>` reads the `group` field of agents/<name>.md: one group or a list of groups.
 * Each other agent type, a missing file, a missing field or a value outside GROUPS gives null (fail closed).
 */
export function agentGroups(pluginRoot, agentType) {
  if (agentType === undefined) return [...MAIN_SESSION_GROUPS];
  if (typeof agentType !== 'string') return null;
  const sep = agentType.indexOf(':');
  if (sep < 0 || agentType.slice(0, sep) !== AGENT_PLUGIN) return null;
  const name = agentType.slice(sep + 1);
  if (!NAME.test(name)) return null;
  const front = frontmatter(path.join(pluginRoot, 'agents', `${name}.md`));
  if (front === null) return null;
  const value = field(front, 'group');
  if (value === undefined || value === null) return null;
  const values = Array.isArray(value) ? value : [value];
  return allGroups(values) ? values : null;
}

/**
 * Split a skill value `<plugin>:<name>`. The plugin part is trimmed and lower-cased, so that a case or space variant
 * of a guilda plugin name is still a guilda skill. Returns { plugin, name } or null when the value has no colon.
 */
function splitSkill(skill) {
  const sep = skill.indexOf(':');
  if (sep < 0) return null;
  return { plugin: skill.slice(0, sep).trim().toLowerCase(), name: skill.slice(sep + 1) };
}

/**
 * A bare skill name (no plugin prefix) that names a guilda skill on disk gets its plugin prefix. Claude Code loads a
 * plugin skill by its bare name and the hook sees the bare value (lab of 2026-11-17), so the name cannot skip R30.
 * Each other value comes back as it is.
 */
export function qualifySkill(pluginRoot, skill) {
  if (typeof skill !== 'string' || skill.includes(':')) return skill;
  const name = skill.trim().replace(/^\//, '').toLowerCase();
  if (!NAME.test(name)) return skill;
  for (const [plugin, dirs] of Object.entries(SKILL_DIRS)) {
    if (fs.existsSync(path.join(pluginRoot, ...dirs, name, 'SKILL.md'))) return `${plugin}:${name}`;
  }
  return skill;
}

/** True when the skill value names a skill of the core or of the extension plugin. A non-string is unknown: null. */
export function isGuildaSkill(skill) {
  if (typeof skill !== 'string') return null;
  const parts = splitSkill(skill);
  return parts !== null && Object.hasOwn(SKILL_DIRS, parts.plugin);
}

/**
 * The groups of a skill. `guilda:<name>` reads skills/<name>/SKILL.md, `guilda-skills:<name>` reads
 * plugins/guilda-skills/skills/<name>/SKILL.md. Each other value is { guilda: false }.
 * groups is null when the file is missing or not readable, has no `groups` field, or the value is not a list of
 * GROUPS values or the one value `shared` (fail closed).
 */
export function skillGroups(pluginRoot, skill) {
  if (!isGuildaSkill(skill)) return { guilda: false };
  const { plugin, name } = splitSkill(skill);
  if (!NAME.test(name)) return { guilda: true, groups: null };
  const front = frontmatter(path.join(pluginRoot, ...SKILL_DIRS[plugin], name, 'SKILL.md'));
  if (front === null) return { guilda: true, groups: null };
  const value = field(front, 'groups');
  if (!Array.isArray(value)) return { guilda: true, groups: null };
  const shared = value.length === 1 && value[0] === SHARED;
  return { guilda: true, groups: shared || allGroups(value) ? value : null };
}

/** True when an agent with `agent` groups may load a skill with `skill` groups. */
export function mayLoad(agent, skill) {
  if (skill.length === 1 && skill[0] === SHARED) return true;
  return agent.some((g) => skill.includes(g));
}
