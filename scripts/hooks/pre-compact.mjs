import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/project.mjs';
import { appendViolation } from '../lib/violations.mjs';
import { resolveProjectDir, runHookMain } from '../lib/hook-io.mjs';
import { createSkeleton, MARKER } from '../journal-skeleton.mjs';

const FRESH_MS = 30 * 60 * 1000;

/** The newest diary younger than 30 minutes, or null. */
function freshDiary(projectDir) {
  try {
    const dir = path.join(projectDir, '.journal');
    let best = null;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const file = path.join(dir, name);
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    }
    return best && Date.now() - best.mtime < FRESH_MS ? best.file : null;
  } catch {
    return null;
  }
}

await runHookMain(async (input) => {
  const projectDir = resolveProjectDir(input);
  const loaded = loadConfig(projectDir);
  if (!loaded || !loaded.ok) return 0;

  const trigger = (input.trigger || input.compaction_type) === 'auto' ? 'auto' : 'manual';
  const diary = freshDiary(projectDir) ?? createSkeleton(projectDir, `pre-compact-${trigger}`);
  const unfilled = fs.readFileSync(diary, 'utf8').includes(MARKER);
  if (!unfilled || trigger === 'auto') return 0;

  appendViolation(projectDir, {
    rule: 'R18',
    level: 'law',
    source: 'pre-compact',
    action: 'manual compact with unfilled diary',
  });
  process.stderr.write(
    `Context diary incomplete: ${diary} still has '${MARKER}' markers. ` +
      'Fill every section and remove the markers, then run /compact again.\n',
  );
  return 2;
});
