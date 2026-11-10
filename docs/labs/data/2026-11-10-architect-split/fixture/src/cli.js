#!/usr/bin/env node
// notes: a small CLI that keeps one Markdown file for each note in notes/.
import { readdirSync } from 'node:fs';
const [cmd] = process.argv.slice(2);
if (cmd === 'list') for (const f of readdirSync('notes')) console.log(f);
else { console.error('usage: notes list'); process.exit(2); }
