#!/usr/bin/env node
// Usage: node labs/links/linkify.mjs [text]   (no text: a sample reply)
// Turns the plain references of an assistant reply into Markdown links, with code and no model tokens.
// A Claude Code mod can run this in a ui.render hook on AssistantMessage and pass the new text on.
// References: block IDs (D33, R19), commit hashes (4f34c53), file paths and names, with an optional :line.
// Each link is a file:// URL with the line in the fragment (#L633), or #commit=<hash> on the repo root.
// Fenced code blocks stay as they are. A name that matches more than one file in the project stays plain text.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const git = (root, args) => {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

// The context: the files of the project and the block index (ID -> file and line). The index is a scan of
// the "### <ID> " headings of the Markdown files here; the block index of D27 can take its place.
export function projectContext(root) {
  const files = (git(root, ['ls-files']) || '').split('\n').filter(Boolean);
  const blocks = new Map();
  for (const rel of files.filter((f) => f.endsWith('.md'))) {
    const lines = fs.readFileSync(path.join(root, rel), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const m = /^#{2,4} ([A-Z]{1,4}\d+)\b/.exec(l);
      if (m && !blocks.has(m[1])) blocks.set(m[1], { file: rel, line: i + 1 });
    });
  }
  return {
    root,
    files,
    block: (id) => blocks.get(id) || null,
    commit: (hash) => (git(root, ['rev-parse', '--verify', '--quiet', `${hash}^{commit}`]) ? hash : null),
  };
}

const fileUrl = (ctx, rel, line) => pathToFileURL(path.join(ctx.root, rel)).href + (line ? `#L${line}` : '');

// The one project file that a path or a bare name names, or null when there is none or more than one.
function findFile(ctx, name) {
  const clean = name.replace(/^\.\//, '');
  if (ctx.files.includes(clean)) return clean;
  const hits = ctx.files.filter((f) => f === clean || f.endsWith(`/${clean}`));
  return hits.length === 1 ? hits[0] : null;
}

const TOKEN = /`([^`\n]+)`|\b([A-Z]{1,4}\d+)\b|\b([0-9a-f]{7,40})\b|((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z]{1,8})(?::(\d+))?/g;

function linkLine(text, ctx) {
  return text.replace(TOKEN, (all, code, id, hash, file, line, offset, whole) => {
    if (whole[offset - 1] === '[' || whole[offset - 1] === '(' || whole.slice(offset - 3, offset) === '://') return all;
    if (code !== undefined) {
      const inner = linkLine(code, ctx);
      const m = /^\[[^\]]*\]\(([^)]+)\)$/.exec(inner);
      return m ? `[\`${code}\`](${m[1]})` : all;
    }
    if (id) {
      const b = ctx.block(id);
      return b ? `[${id}](${fileUrl(ctx, b.file, b.line)})` : all;
    }
    if (hash) {
      return ctx.commit(hash)
        ? `[${hash}](${pathToFileURL(ctx.root).href}#commit=${hash})`
        : all;
    }
    const rel = findFile(ctx, file);
    return rel ? `[${file}${line ? `:${line}` : ''}](${fileUrl(ctx, rel, line)})` : all;
  });
}

export function linkify(text, ctx) {
  let fenced = false;
  return text
    .split('\n')
    .map((l) => {
      if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
      return fenced || /^\s*(```|~~~)/.test(l) ? l : linkLine(l, ctx);
    })
    .join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const ctx = projectContext(root);
  const head = (git(root, ['rev-parse', '--short', 'HEAD']) || '').trim();
  const sample =
    process.argv[2] ||
    `D33 needs D14 and R19. See \`show-links.mjs:42\`, open-at-line.mjs and kitty.conf.\n` +
      `Commit ${head} has it. The spec is docs/superpowers/specs/2026-11-09-guilda-0.2-design.md:633.\n` +
      '```\nD14 in a fence stays plain\n```';
  process.stdout.write(`${linkify(sample, ctx).split(pathToFileURL(root).href).join('file://<root>')}\n`);
}
