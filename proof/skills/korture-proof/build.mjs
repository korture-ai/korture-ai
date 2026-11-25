// Korture Proof: put one korture-part JSON into the page and write a standalone HTML file.
// Usage: node tools/proof/build.mjs <part.json> <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
const [, , src, out] = process.argv;
if (!src || !out) { console.error('usage: build.mjs <part.json> <out.html>'); process.exit(1); }
const page = readFileSync(new URL('./page.html', import.meta.url), 'utf8');
const data = JSON.stringify(JSON.parse(readFileSync(src, 'utf8'))).replace(/</g, '\\u003c');
writeFileSync(out, page.replace('/*DATA*/', () => data));
console.log('wrote', out);
