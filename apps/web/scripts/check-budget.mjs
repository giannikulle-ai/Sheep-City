// Fails the build when dist/ outgrows apps/web/budget.json.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');
const budget = JSON.parse(readFileSync(join(root, 'budget.json'), 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist);
const kb = (n) => n / 1024;
const sum = (ext) => files.filter((f) => extname(f) === ext).reduce((n, f) => n + statSync(f).size, 0);
const js = kb(sum('.js'));
const css = kb(sum('.css'));
const total = kb(files.reduce((n, f) => n + statSync(f).size, 0));

const rows = [
  ['js', js, budget.maxJsKb],
  ['css', css, budget.maxCssKb],
  ['total', total, budget.maxTotalKb],
];
let ok = true;
for (const [name, size, max] of rows) {
  const pass = size <= max;
  ok &&= pass;
  console.log(`budget ${name.padEnd(5)} ${size.toFixed(1).padStart(7)} kB / ${String(max).padStart(4)} kB ${pass ? 'ok' : 'OVER'}`);
}
if (!ok) {
  console.error('bundle over budget; largest files:');
  for (const f of files.sort((a, b) => statSync(b).size - statSync(a).size).slice(0, 8)) {
    console.error(`  ${kb(statSync(f).size).toFixed(1).padStart(7)} kB ${relative(root, f)}`);
  }
  process.exit(1);
}
