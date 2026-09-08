// Guard: no test anywhere in this package is skipped, narrowed to `.only`, or left `.todo`.
//
// Round 2 on #61 (review finding 3): the DL invariant's own self-check
// (test/invariants/dl-invariant.test.ts's "this file is the DL invariant" describe) reads only its
// own source, so it can prove itself un-skipped but cannot prove itself *run* — skip every describe
// in that file, its own included, and the self-check goes down with the rest of the file: nothing
// is left to report it. This file is the fix: it lives outside dl-invariant.test.ts and walks every
// *other* test file in the package, failing on a skip/only/todo modifier wherever one appears.
//
// This file's own source is exempt from its own scan (below), for the same structural reason
// no-random.test.ts exempts itself from its banned-call scan: it necessarily names the very
// patterns it looks for, in prose and in the pattern table, so scanning itself would be scanning
// its own vocabulary, not a real modifier. That leaves one gap by construction — a `.skip` added
// inside this file itself would not be caught by this file — which is the same one level of
// non-self-coverage no-random.test.ts already accepts; going further would just move the same gap
// into a third file. It also asserts by name that the DL invariant test and its harm definition
// exist and still carry the describes the charter requires, so the file being deleted or gutted is
// caught too, not only a modifier added inside it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const testDir = fileURLToPath(new URL('.', import.meta.url));
const self = fileURLToPath(import.meta.url);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

// `describe.skip`, `it.skip`, `test.skip` (and the `.only`, `.todo` equivalents) are all just a
// `.skip`/`.only`/`.todo` property access on whatever came before it, so one pattern per modifier
// catches every caller of it regardless of which function it's called on.
const MODIFIERS: [string, RegExp][] = [
  ['.' + 'skip', /\.\s*skip\b/],
  ['.' + 'only', /\.\s*only\b/],
  ['.' + 'todo', /\.\s*todo\b/],
];

describe('no test file in this package skips, narrows to .only, or leaves a .todo', () => {
  const files = walk(testDir);

  it('scans the package test files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(relative(root, file), () => {
      // The file's own source is exempt from its own scan (see the module doc comment above for
      // why that is still safe): every other file, this one included by name below, is not.
      if (file === self) return;
      const text = readFileSync(file, 'utf8');
      for (const [label, re] of MODIFIERS) {
        const m = re.exec(text);
        expect(m, `${relative(root, file)} has a ${label} modifier`).toBeNull();
      }
    });
  }

  const invariantFile = join(testDir, 'invariants', 'dl-invariant.test.ts');
  const harmFile = join(testDir, 'invariants', 'dl-harm.ts');

  it('the DL invariant test file exists and still carries its six describes', () => {
    expect(existsSyncOrThrow(invariantFile)).toBe(true);
    const text = readFileSync(invariantFile, 'utf8');
    const describes = [
      'the intent list below covers every intent type the sim accepts',
      'fuzz: nothing in the sim can harm Digital Luna (#61)',
      'static guard: nothing outside her own chain writes to Digital Luna',
      'off-screen: a respawned state never harms Digital Luna either (CLAUDE.md: "on screen or off")',
      'harm predicate: every HARM_CHECKS entry actually fires, and the set cannot shrink silently',
      'this file is the DL invariant: it exists and is never skipped or narrowed',
    ];
    for (const d of describes) expect(text, `dl-invariant.test.ts is missing the describe: ${d}`).toContain(d);
    // Round 4, review finding F2: the list above only proves the describes it names are present —
    // it does not prove a *new* describe added to the file without a matching entry here would be
    // caught. Every describe in dl-invariant.test.ts is written at column 0 (no nesting), so this
    // counts them directly from the file's own source and checks the count matches the list, not
    // just that the list's contents are a subset of what's there.
    const actualCount = (text.match(/^describe\(/gm) ?? []).length;
    expect(
      actualCount,
      `dl-invariant.test.ts has ${actualCount} top-level describe(s) but this list names ${describes.length} — a describe was added or removed without updating this list`,
    ).toBe(describes.length);
  });

  it('its harm definition exists and still exports the shared predicate', () => {
    expect(existsSyncOrThrow(harmFile)).toBe(true);
    const text = readFileSync(harmFile, 'utf8');
    expect(text).toContain('export function harmIn');
    expect(text).toContain('export const HARM_CHECKS');
  });
});

function existsSyncOrThrow(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
