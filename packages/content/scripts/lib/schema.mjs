// A small JSON Schema (draft 2020-12 subset) checker with no dependencies.
// It supports exactly the keywords the content schemas use and throws on any
// other keyword, so a schema can never pass by being silently ignored.
// Swap for ajv when the workspace has a lockfile; the schemas are standard.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const IGNORED = new Set(["$schema", "$id", "title", "description", "$comment", "$defs", "examples"]);
const KNOWN = new Set([
  ...IGNORED, "type", "properties", "required", "additionalProperties", "propertyNames", "minProperties",
  "items", "prefixItems", "minItems", "maxItems", "uniqueItems", "enum", "const",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "minLength", "maxLength",
  "$ref", "anyOf", "oneOf", "allOf", "not",
]);

const typeOf = (v) => v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function loadSchema(file) {
  const cache = new Map();
  const load = (f) => {
    const abs = resolve(f);
    if (!cache.has(abs)) cache.set(abs, { doc: JSON.parse(readFileSync(abs, "utf8")), dir: dirname(abs) });
    return cache.get(abs);
  };
  const root = load(file);
  return { root: root.doc, load, dir: root.dir };
}

function deref(ref, ctx) {
  const [file, frag = ""] = ref.split("#");
  const base = file ? ctx.load(resolve(ctx.dir, file)) : ctx.current;
  let node = base.doc;
  for (const part of frag.split("/").filter(Boolean)) {
    node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (node === undefined) throw new Error(`unresolvable $ref ${ref}`);
  }
  return { node, ctx: { ...ctx, current: base, dir: base.dir } };
}

export function validate(schemaFile, data) {
  const { root, load, dir } = loadSchema(schemaFile);
  const errors = [];
  check(root, data, "$", { load, dir, current: { doc: root, dir } }, errors);
  return errors;
}

function check(schema, data, path, ctx, errors) {
  if (schema === true) return;
  if (schema === false) { errors.push(`${path}: schema forbids any value`); return; }
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`unsupported schema keyword "${k}" at ${path}`);

  if (schema.$ref) { const r = deref(schema.$ref, ctx); check(r.node, data, path, r.ctx, errors); }

  if (schema.type) {
    const want = [].concat(schema.type), got = typeOf(data);
    const ok = want.some((t) => t === got || (t === "integer" && got === "number" && Number.isInteger(data)));
    if (!ok) { errors.push(`${path}: expected ${want.join("|")}, got ${got}`); return; }
  }
  if ("const" in schema && !same(schema.const, data)) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((e) => same(e, data))) errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);

  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(`${path}: ${data} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) errors.push(`${path}: ${data} > maximum ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) errors.push(`${path}: ${data} <= exclusiveMinimum ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) errors.push(`${path}: ${data} >= exclusiveMaximum ${schema.exclusiveMaximum}`);
  }
  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && data.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errors.push(`${path}: "${data}" does not match /${schema.pattern}/`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(data.map((d) => JSON.stringify(d))).size !== data.length) errors.push(`${path}: items must be unique`);
    const prefix = schema.prefixItems ?? [];
    data.forEach((item, i) => {
      const sub = i < prefix.length ? prefix[i] : schema.items;
      if (sub !== undefined) check(sub, item, `${path}[${i}]`, ctx, errors);
    });
  }
  if (typeOf(data) === "object") {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) if (!(key in data)) errors.push(`${path}: missing required "${key}"`);
    if (schema.minProperties !== undefined && Object.keys(data).length < schema.minProperties) errors.push(`${path}: fewer than ${schema.minProperties} properties`);
    for (const [key, value] of Object.entries(data)) {
      const sub = `${path}.${key}`;
      if (schema.propertyNames) check(schema.propertyNames, key, `${sub} (name)`, ctx, errors);
      if (key in props) check(props[key], value, sub, ctx, errors);
      else if (schema.additionalProperties === false) errors.push(`${sub}: not allowed here`);
      else if (schema.additionalProperties && schema.additionalProperties !== true) check(schema.additionalProperties, value, sub, ctx, errors);
    }
  }
  const branch = (s) => { const e = []; check(s, data, path, ctx, e); return e.length === 0; };
  if (schema.allOf && !schema.allOf.every(branch)) errors.push(`${path}: fails allOf`);
  if (schema.anyOf && !schema.anyOf.some(branch)) errors.push(`${path}: matches none of anyOf`);
  if (schema.oneOf && schema.oneOf.filter(branch).length !== 1) errors.push(`${path}: must match exactly one of oneOf`);
  if (schema.not && branch(schema.not)) errors.push(`${path}: matches forbidden schema`);
}
