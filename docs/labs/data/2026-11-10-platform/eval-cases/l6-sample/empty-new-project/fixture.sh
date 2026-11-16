#!/usr/bin/env bash
# Fixture: a new project with a git repository and one package file.
set -eu
git init -q
printf '{ "name": "l6-sample", "version": "0.0.0", "scripts": { "test": "node --test" } }\n' > package.json
printf 'scaffold PATH=%s\n' "$PATH" > .l6-scaffold-env.txt
