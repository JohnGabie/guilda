# guilda

`guilda` is a Claude Code plugin. It gives a project shared engineering rules, roles and checks.

This repository has three plugins. They share one version.

- `guilda`: the core. It has the rules, the hooks, the agents, `guilda:init` and the Architect. It has no dependency.
- `guilda-skills`: the extension, with eight skills: `data`, `ai-engineering`, `ai-evals`, `lab-experiment`,
  `devops`, `ai-data`, `agent-creator` and `security-zones`. It needs `superpowers` and `skill-creator`.
- `ios-on-linux`: control a real iPhone from a Linux PC.

## Install

```
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add JohnGabie/guilda
claude plugin install guilda@guilda
claude plugin install guilda-skills@guilda
claude plugin install ios-on-linux@guilda
```

The core `guilda` works alone. `ios-on-linux` works alone. `guilda-skills` needs the `superpowers` and
`skill-creator` plugins of the official Anthropic marketplace. The install of `guilda-skills` adds them as dependencies. Skip the first line when
`claude plugin marketplace list` already shows the official marketplace.

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
