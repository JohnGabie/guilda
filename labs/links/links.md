# Links to D14 (lab: click links)

Target: the first line of the block `### D14` in `docs/superpowers/specs/2026-11-09-guilda-0.2-design.md`,
line 633 on the commit of this file. The line changes when the spec changes. Run
`node labs/links/show-links.mjs` to get the line number now.

Open this file in VS Code (the editor and the Markdown preview) or in a Markdown reader. Ctrl+click or click each
link. Write down what opened, which file and which line.

1. Relative link with a line fragment: [D14](../../docs/superpowers/specs/2026-11-09-guilda-0.2-design.md#L633)
2. Relative link with a heading fragment:
   [D14](../../docs/superpowers/specs/2026-11-09-guilda-0.2-design.md#d14--agent-queue-in-code-proposed)
3. Relative link without a fragment: [D14](../../docs/superpowers/specs/2026-11-09-guilda-0.2-design.md)
4. Plain text `path:line` from the repo root: docs/superpowers/specs/2026-11-09-guilda-0.2-design.md:633

The `vscode://file/...` link and the absolute `path:line` need the absolute path of this checkout. This file does
not keep machine paths. Get both from the script output.
