#!/usr/bin/env node
// The Codex plugin's only executable (session 90). Codex copies a plugin into
// its own cache, so the Korture folder is found from ~/.korture/config.json,
// never from where this file sits. Forwards the hook; never does any work itself.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

let bin = null;
try {
  const c = JSON.parse(readFileSync(join(process.env.KORTURE_HOME || join(homedir(), '.korture'), 'config.json'), 'utf8'));
  if (c.repo && existsSync(join(c.repo, 'bin', 'korture.mjs'))) bin = join(c.repo, 'bin', 'korture.mjs');
} catch { /* not set up yet: do nothing, cost nothing */ }
if (!bin) { process.stdout.write('{}'); process.exit(0); }
const r = spawnSync(process.execPath, [bin, 'hook', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 0);
