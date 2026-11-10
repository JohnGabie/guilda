#!/usr/bin/env node
// Usage: node labs/links/show-links.mjs [ID]
// Prints one target (the first line of the block "### <ID>" in the 0.2 spec, D14 by default) in each link format,
// with a label, so that a user can click each one in a terminal. No dependencies.
// The paths come from the location of this file, so the output is correct in any checkout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const id = process.argv[2] || 'D14';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const rel = 'docs/superpowers/specs/2026-11-09-guilda-0.2-design.md';
const abs = path.join(root, rel);

const lines = fs.readFileSync(abs, 'utf8').split('\n');
const index = lines.findIndex((l) => l.startsWith(`### ${id} `) || l === `### ${id}`);
if (index < 0) {
  process.stderr.write(`no block "### ${id}" in ${rel}\n`);
  process.exit(1);
}
const line = index + 1;

const fileUrl = pathToFileURL(abs).href;
const vscodeUrl = `vscode://file${abs}:${line}`;
const ESC = '\u001b';
const BEL = '\u0007';
// OSC 8 terminal hyperlink: ESC ] 8 ; ; URL ESC \ TEXT ESC ] 8 ; ; ESC \
const osc8 = (url, text) => `${ESC}]8;;${url}${ESC}\\${text}${ESC}]8;;${ESC}\\`;
// The same link with BEL as the terminator, which some terminals need.
const osc8Bel = (url, text) => `${ESC}]8;;${url}${BEL}${text}${ESC}]8;;${BEL}`;

const rows = [
  ['A', 'relative path:line (from the repo root)', `${rel}:${line}`],
  ['B', 'absolute path:line', `${abs}:${line}`],
  ['C', 'vscode:// URL as plain text', vscodeUrl],
  ['D', 'file:// URL as plain text (no line in the URL)', fileUrl],
  ['E', 'OSC 8 link to the file:// URL', osc8(fileUrl, `${id} (file)`)],
  ['F', 'OSC 8 link to the vscode:// URL', osc8(vscodeUrl, `${id} (vscode)`)],
  ['G', 'OSC 8 link to the vscode:// URL, BEL terminator', osc8Bel(vscodeUrl, `${id} (vscode, BEL)`)],
  ['H', 'Markdown link, relative', `[${id}](${rel}#L${line})`],
  ['I', 'Markdown link, vscode://', `[${id}](${vscodeUrl})`],
];

process.stdout.write(`Target: ${id}, the line "${lines[index]}"\n`);
process.stdout.write(`File: ${abs}\nLine: ${line}\n\n`);
for (const [key, label, text] of rows) {
  process.stdout.write(`${key}. ${label}\n   ${text}\n\n`);
}
process.stdout.write(
  'For each item: Ctrl+click it (then a plain click). Write down what opened, which file and which line.\n' +
    `Commands to compare: code --goto ${abs}:${line}   and   zed ${abs}:${line}\n`,
);
