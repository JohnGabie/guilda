# guilda

`guilda` is a Claude Code plugin. It gives a project shared engineering rules, roles and checks.

## Install

```
claude plugin marketplace add JohnGabie/guilda
claude plugin install guilda@guilda
```

## Updates

Turn on auto-update for the marketplace. Auto-update is off by default for a marketplace that is not an
official one. Open `/plugin`, go to Marketplaces, and select Enable auto-update.

To update by hand, run `claude plugin update guilda@guilda`. A running session keeps the loaded version. Run
`/reload-plugins` or start a new session to load the update.

## First use

In your project, run `guilda:init`. It adapts `guilda` to the project and creates `.guilda/config.json`.
