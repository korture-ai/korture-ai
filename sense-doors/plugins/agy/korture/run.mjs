#!/usr/bin/env node
// The plugin's only executable. Finds bin/korture.mjs and forwards the hook.
// First the repo this folder sits in (plugins/claude-code/plugins/korture/hooks),
// then the repo ~/.korture/config.json points at. Never does any work itself.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [resolve(here, '../../../../../bin/korture.mjs')];
try {
  const c = JSON.parse(readFileSync(join(process.env.KORTURE_HOME || join(homedir(), '.korture'), 'config.json'), 'utf8'));
  if (c.repo) candidates.push(join(c.repo, 'bin', 'korture.mjs'));
} catch { /* not set up yet: do nothing, cost nothing */ }
const bin = candidates.find((p) => existsSync(p));
if (!bin) process.exit(0);
const r = spawnSync(process.execPath, [bin, 'hook', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 0);
