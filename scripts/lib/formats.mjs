// Format checks for the briefs, verdicts and QA reports that the guilda roles write.
// Each function returns a list of error strings. An empty list means the text is valid.

const BRIEF_FIELDS = [
  'ID / title',
  'Goal',
  'Context',
  'Out of scope',
  'Files it may touch',
  'Contract / interfaces',
  'Tests that must pass',
  'Acceptance',
  'Suggested tier',
  'Risk area',
  'Deletion rules',
  'Dependencies',
];
const TIERS = ['master', 'journeyman', 'apprentice'];

const RESULTS = {
  reviewer: ['APPROVED', 'REJECTED-SMALL', 'REJECTED-LARGE'],
  security: ['APPROVED', 'REJECTED'],
};
const STAGES = ['code', 'final'];

const lines = (text) => (typeof text === 'string' ? text : '').split(/\r?\n/);

/**
 * The value of a `Name:` line: the text after the colon, plus indented continuation lines.
 * Null when the line is absent or has no value.
 */
function fieldValue(all, name) {
  const prefix = `${name}:`;
  const index = all.findIndex((l) => l.startsWith(prefix));
  if (index < 0) return null;
  const parts = [all[index].slice(prefix.length).trim()];
  for (let i = index + 1; i < all.length && /^[ \t]+\S/.test(all[i]); i += 1) parts.push(all[i].trim());
  const value = parts.filter(Boolean).join(' ');
  return value || null;
}

/** Names of the brief fields that are missing, empty or invalid. */
export function validateBrief(text) {
  const all = lines(text);
  const errors = [];
  for (const name of BRIEF_FIELDS) {
    const value = fieldValue(all, name);
    if (value === null) errors.push(name);
    else if (name === 'Suggested tier' && !TIERS.includes(value)) {
      errors.push(`Suggested tier (must be ${TIERS.join(', ')})`);
    }
  }
  return errors;
}

/** The value of the last line that starts with `Label:` (leading space allowed), or null. */
function lastLabel(all, label) {
  let value = null;
  const re = new RegExp(`^[ \\t]*${label}:[ \\t]*(.*)$`);
  for (const l of all) {
    const m = re.exec(l);
    if (m) value = m[1].trim();
  }
  return value;
}

/** Errors of a Reviewer or Security verdict. */
export function validateVerdict(text, kind) {
  const all = lines(text);
  const allowed = RESULTS[kind] ?? [];
  const errors = [];

  const result = lastLabel(all, 'Result');
  if (!result) errors.push('Result line missing');
  else if (!allowed.includes(result.split(/\s+/)[0]) || result.includes('|')) {
    errors.push(`Result must be one of ${allowed.join(', ')}`);
  }

  const stage = lastLabel(all, 'Stage');
  if (kind === 'reviewer' && stage !== null && !(STAGES.includes(stage.split(/\s+/)[0]) && !stage.includes('|'))) {
    errors.push(`Stage must be one of ${STAGES.join(', ')}`);
  }

  if (!lastLabel(all, 'Violations')) errors.push('Violations line missing');
  return errors;
}

const SCENARIO_START = /^[ \t]*(?:\d+[.)]|[-*])[ \t]/;

/** Labels that start a section of a QA report, in the order of agents/qa.md. */
export const QA_SECTION_LABELS = [
  'Environment:', 'Tools:', 'Scenarios:', 'Phase 2 plan:', 'Phase 2 findings:', 'States checked:',
  'Persistence after reload:', 'Logs:', 'Out-of-scope notes (for the Architect):', 'User must look:',
  'Limits of this check:',
];
const SCENARIO_RESULT = /\b(PASSED|FAILED|NOT VERIFIED)\b[ \t]*[—–-]+[ \t]*\S/;

/** Errors of a QA report. */
export function validateQaReport(text) {
  const all = lines(text);
  const start = all.findIndex((l) => /^Scenarios:/.test(l));
  if (start < 0) return ['Scenarios section missing'];

  // Group the section lines into scenarios. The section ends at the next QA label at column 0.
  const scenarios = [];
  for (let i = start + 1; i < all.length && !QA_SECTION_LABELS.some((l) => all[i].startsWith(l)); i += 1) {
    if (SCENARIO_START.test(all[i])) scenarios.push([all[i]]);
    else if (scenarios.length > 0 && all[i].trim()) scenarios[scenarios.length - 1].push(all[i]);
  }
  if (scenarios.length === 0) return ['Scenarios section has no scenario'];

  const errors = [];
  scenarios.forEach((block, n) => {
    const body = block.join('\n');
    const label = block[0].trim().split(/\s+/)[0];
    const ref = /^\d+[.)]$/.test(label) ? label.slice(0, -1) : String(n + 1);
    const m = SCENARIO_RESULT.exec(body);
    if (!m) errors.push(`Scenario ${ref}: needs PASSED, FAILED or NOT VERIFIED, then a dash and evidence`);
    else if (m[1] === 'NOT VERIFIED' && !/Not verified because:[ \t]*\S/.test(body)) {
      errors.push(`Scenario ${ref}: NOT VERIFIED needs "Not verified because: <reason>"`);
    }
  });
  return errors;
}
