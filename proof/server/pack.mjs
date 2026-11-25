// Packs the page and the reading guide into the server, so one deploy carries all three.
// Usage: node tools/proof/server/pack.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const here = (f) => new URL(f, import.meta.url);
const page = readFileSync(here('../page.html'), 'utf8');
const skill = readFileSync(here('../SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\s*/, '');
// The guide is the skill without the parts that only make sense for a skill file.
const guide = skill.replace(/## How it looks[\s\S]*?(?=\nRules:)/, '');
writeFileSync(here('./page.ts'), `export const PAGE = ${JSON.stringify(page)};\n`);
writeFileSync(here('./guide.ts'), `export const GUIDE = ${JSON.stringify(guide)};\n`);
console.log('packed', page.length, 'bytes of page,', guide.length, 'of guide');
