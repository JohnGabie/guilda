import fs from 'node:fs';
import path from 'node:path';

const core = (v) => String(v).split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);

/** Compare two semver strings (pre-release and build parts are ignored). */
export function compareSemver(a, b) {
  const x = core(a);
  const y = core(b);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Return the version in <pluginRoot>/.claude-plugin/plugin.json, or "0.0.0". */
export function installedVersion(pluginRoot) {
  try {
    const text = fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8');
    const v = JSON.parse(text).version;
    return typeof v === 'string' && v ? v : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
