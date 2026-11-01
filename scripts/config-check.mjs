#!/usr/bin/env node
import { loadConfig } from './lib/project.mjs';

const projectDir = process.argv[2];
if (!projectDir) {
  console.log('usage: config-check.mjs <projectDir>');
  process.exit(1);
}
const result = loadConfig(projectDir);
if (result === null) {
  console.log('no .guilda/config.json');
  process.exit(1);
}
if (!result.ok) {
  console.log(result.reason);
  process.exit(1);
}
console.log('ok');
