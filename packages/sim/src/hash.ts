// State hashing for the determinism test and for save checks. Canonical JSON (sorted keys) run
// through two independent 32-bit hashes, printed as 16 hex digits.

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(',')}}`;
}

/** FNV-1a, 32-bit. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A second, unrelated 32-bit mix so two states that collide on FNV still differ. */
export function mix32(text: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash any plain-data value. Equal values give equal hashes regardless of key order. */
export function hashValue(value: unknown): string {
  const text = canonicalJson(value);
  return fnv1a(text).toString(16).padStart(8, '0') + mix32(text).toString(16).padStart(8, '0');
}

/** Hash a world state. */
export function hashState(state: unknown): string {
  return hashValue(state);
}
