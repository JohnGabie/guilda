# guilda

`guilda` is a Claude Code plugin. It gives a project shared engineering rules, roles and checks.

This repository has four plugins. They share one version.

- `guilda`: the core. It has the rules, the hooks, the agents, `guilda:init` and the Architect. It has no dependency.
- `guilda-skills`: the extension, with eight skills: `data`, `ai-engineering`, `ai-evals`, `lab-experiment`,
  `devops`, `ai-data`, `agent-creator` and `security-zones`. It needs `superpowers` and `skill-creator`.
- `ios-on-linux`: control a real iPhone from a Linux PC.
- `guilda-panel`: the panel plugin for the queue and the agents of a project. Its panel module is the `guilda-panel` mod. See "The bus and the panel".

## Install

```
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add JohnGabie/guilda
claude plugin install guilda@guilda
claude plugin install guilda-skills@guilda
claude plugin install ios-on-linux@guilda
claude plugin install guilda-panel@guilda
```

The core `guilda` works alone. `ios-on-linux` works alone. `guilda-skills` needs the `superpowers` and
`skill-creator` plugins of the official Anthropic marketplace. The install of `guilda-skills` adds them as
dependencies. Skip the first line when `claude plugin marketplace list` already shows the official marketplace.

To check that `guilda` loaded, ask Claude Code to list its agents: a `guilda:*` agent (for example
`guilda:executor`) exists when it did.

A project-scope install loads only when Claude Code starts in that project folder.

To try `guilda` for one session without a change to your settings, load it from a local copy:

```
claude --plugin-dir <path of the local copy>
```

## Updates

Turn on auto-update for the marketplace. Auto-update is off by default for a marketplace that is not an
official one. Open `/plugin`, go to Marketplaces, and select Enable auto-update.

To update by hand, run `claude plugin update guilda@guilda`. A running session keeps the loaded version. Run
`/reload-plugins` or start a new session to load the update.

## Status file for other tools

The queue script writes `.guilda/status.md`, a copy of the state of the queue. Other tools can read this file.
Run `node scripts/status.mjs <project>` to see the state, or add `--agent <name>` to see one agent.

## The bus and the panel

- The bus: agents send messages to an address. Each address has a mailbox in `.guilda/bus/`. Only
  `node scripts/bus.mjs <project> <command>` writes there. The commands are `send`, `join`, `who`, `pending`,
  `deliver` and `verify`.
- User records: a hook writes one record for each prompt or answer of the user. `bus.mjs verify <id>` checks a
  record. A user decision needs a record (R35).
- `bus.mjs deliver <address>` lists the pending messages of one address with their routes. It starts no agent.
- The @mention: start a prompt with `@<target> <text>`. The hook adds the address to the context of the session.
  The target is an address that is bound.
- The `guilda-panel` mod shows each agent of the project as a row, with its binding. Run `/guilda-agents` to open
  the detail pane. Run `/guilda-agents log <address>` to open the log of one agent.

## The supervisor

The supervisor is a session that runs the queue of a build at the pace of your budget. Only you start it (R36).

1. In the project folder, run `claude --agent guilda:supervisor`.
2. In that session, run `/loop 30m` with the prompt `node <plugin root>/scripts/tick.mjs . --json --session <id>`.
   The `<plugin root>` is the folder of the guilda plugin.
   The `<id>` is in the line `guilda session: <id>` of the session start.

The supervisor claims the queue and dispatches each task of the plan. It saves the work of an agent
before it stops that agent. It sends each message for you to the Architect. It never merges into `main`, tags or pushes.

The supervisor works on its own branch, `work/<work id>`, and never touches `main`. If the project folder is on
another branch, the supervisor uses that branch. You merge the branch of the supervisor yourself.

The supervisor stops at the 5% floor of the budget. It also stops when only items for you are left.
The summary of the run is in `.guilda/supervisor-summary.md`.

## Update from 0.1.x

The 0.1.x layer of a project works as it is. Run `guilda:update`: it saves the new version in
`.guilda/config.json`. No project runs `guilda:init` again.

## First use

In your project, run `guilda:init`. It adapts `guilda` to the project and creates `.guilda/config.json`.

## Process levels

`guilda:init` asks for the process level. It is saved in `.guilda/config.json`.

- `light`: for a prototype or a personal project. One review at the end.
- `full`: for a product. Each task is reviewed.

## Skills you call

- `guilda:architect`: the spec, the plan and the task briefs.
- `guilda:init`: adapts `guilda` to the project.
- `guilda:update`: updates `guilda` and shows what changed.
- `guilda:report`: files a field report as a GitHub issue, after you approve it.
