// Guard: nothing in the package reaches for wall time or unseeded randomness.
// Time comes in as a parameter and every draw goes through src/rng.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const self = fileURLToPath(import.meta.url);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && p !== self) out.push(p);
  }
  return out;
}

// Each pattern is split so this file does not match itself if it is ever scanned.
const banned: [string, RegExp][] = [
  ['Math.' + 'random', /Math\s*\.\s*random\b/],
  ['Date.' + 'now', /Date\s*\.\s*now\b/],
  ['new ' + 'Date', /new\s+Date\b/],
  ['performance.' + 'now', /performance\s*\.\s*now\b/],
  ['set' + 'Timeout', /\bsetTimeout\b/],
  ['set' + 'Interval', /\bsetInterval\b/],
  ['request' + 'AnimationFrame', /\brequestAnimationFrame\b/],
  ['document', /\bdocument\s*\./],
  ['window', /\bwindow\s*\./],
];

/** Drop line and block comments so prose that names a banned call does not trip the guard. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('no wall clock, no Math.random', () => {
  const files = walk(join(root, 'src')).concat(walk(join(root, 'test')), walk(join(root, 'bench')));

  it('scans the package sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(relative(root, file), () => {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const [label, re] of banned) {
        const m = re.exec(text);
        expect(m, `${relative(root, file)} uses ${label}`).toBeNull();
      }
    });
  }
});
