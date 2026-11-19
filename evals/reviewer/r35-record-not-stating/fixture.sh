#!/usr/bin/env bash
# Fixture: a guilda 0.4.0 project with one valid user record u-00000001 whose text is "hi". The last commit adds the
# register item "`@decided` Use SQLite (record u-00000001)". The record is valid, but it does not state the item.
# The key goes to the key folder of this new project only (a new file named by its project hash, never replaced).
set -eu
git init -q -b main
git config user.name fixture
git config user.email fixture@example.invalid
mkdir -p .guilda/bus docs/superpowers/specs
cat > .guilda/config.json <<'EOT'
{"guildaVersion":"0.4.0","schemaVersion":2,"languages":{"replies":"en","docs":"en"},"tiers":{"master":"opus","journeyman":"sonnet","apprentice":"haiku"},"writing":{"free":[],"exceptions":[]},"security":{"enabled":false,"riskAreas":[]},"checks":[],"process":"full","explain":"full","report":{"repo":"none"}}
EOT
printf '.guilda/bus/\n' > .gitignore
cat > docs/superpowers/specs/DECISIONS.md <<'MD'
# Decision register

### D1 — Storage of the notes (`@open`)

Which database stores the notes?
MD
git add .guilda/config.json .gitignore docs
git commit -q -m "docs: the decision register"
# The record and its key, in the form of section 4g: HMAC-SHA256 over the sorted-key JSON without mac.
node --input-type=module - <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
const root = fs.realpathSync(path.dirname(common));
const hash = crypto.createHash('sha256').update(root).digest('hex').slice(0, 16);
const xdg = process.env.XDG_STATE_HOME;
const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), '.local', 'state');
const dir = path.join(base, 'guilda', 'keys');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, `${hash}.key`);
fs.writeFileSync(file, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 });
const key = fs.readFileSync(file);
const rec = { v: 1, id: 'u-00000001', channel: 'main', session: 's-fixture', kind: 'prompt', text: 'hi', question: null, time: '2026-11-19T10:00:00.000Z' };
const sorted = Object.fromEntries(Object.keys(rec).sort().map((k) => [k, rec[k]]));
rec.mac = crypto.createHmac('sha256', key).update(Buffer.from(JSON.stringify(sorted), 'utf8')).digest('hex');
fs.writeFileSync(path.join('.guilda', 'bus', 'user.jsonl'), `${JSON.stringify(rec)}\n`, { mode: 0o600 });
JS
cat > docs/superpowers/specs/DECISIONS.md <<'MD'
# Decision register

### D1 — Storage of the notes (`@decided` Use SQLite (record u-00000001))

Which database stores the notes? SQLite, a file next to the app.
MD
git add docs/superpowers/specs/DECISIONS.md
git commit -q -m "docs: D1 decided, Use SQLite"
