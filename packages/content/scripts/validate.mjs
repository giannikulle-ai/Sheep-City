#!/usr/bin/env node
// Validates every content file against its schema. Exit 1 on any failure.
// Usage: node scripts/validate.mjs   (or: npm run validate:content)
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/schema.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One line per content file. Add a line here when you add a file.
export const FILES = [
  ["farm/spots.json",    "schema/spots.schema.json"],
  ["farm/tufts.json",    "schema/tufts.schema.json"],
  ["farm/upgrades.json", "schema/upgrades.schema.json"],
  ["farm/npcs.json",     "schema/npcs.schema.json"],
  ["farm/names.json",    "schema/names.schema.json"],
  ["balance/farm.json",  "schema/balance-farm.schema.json"],
];

let failed = 0;
for (const [dataRel, schemaRel] of FILES) {
  const data = JSON.parse(readFileSync(resolve(root, dataRel), "utf8"));
  const errors = validate(resolve(root, schemaRel), data);
  if (data.$schema !== undefined && data.$schema !== `../${schemaRel}`) errors.push(`$: "$schema" should be "../${schemaRel}"`);
  if (errors.length) { failed++; console.log(`FAIL ${dataRel}`); for (const e of errors) console.log(`  ${e}`); }
  else console.log(`ok   ${dataRel}  (${schemaRel})`);
}
console.log(`validate:content: ${FILES.length - failed}/${FILES.length} files pass`);
process.exit(failed ? 1 : 0);
