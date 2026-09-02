#!/usr/bin/env node
// Lane ownership check: every path a PR changes must sit inside the "Owns (paths)" globs of the
// lane named in the PR title, unless the PR body carries an `ownership-exception: <reason>` line
// (bare, as a Markdown list item, or bold; see EXCEPTION_LINE).
//
// Lane = the word before the first colon in the PR title ("art: move the pipeline" -> art).
// Globs = every backtick-quoted pattern in the "## Owns (paths)" section of
// docs/agents/charters/<lane>.md. Prose without backticks, and anything inside parentheses, is
// ignored, so "- `tools/art/**` (moved from `prototype/luna-farm/src/`)" owns only tools/art/**.
// Changed paths = `git diff --name-only <base>...<head>` (three dots: since the merge base, so
// a merge of the base branch into the PR does not count the base's own files).
//
// Usage (CI passes the same values through the environment, see .github/workflows/ci.yml):
//   node tools/ci/ownership.mjs --title "<pr title>" --base <ref> --head <ref> [--body-file <path>]
//   env: PR_TITLE, PR_BODY, BASE_REF, HEAD_REF
//   --files a,b,c     skip git and check these paths instead (for tests)
//   --repo <dir>      repo root that holds docs/agents/charters (default: cwd)
// Exit 0 = every path is owned, or an exception line is present. Exit 1 = a path is outside the
// lane and no exception was declared. Exit 2 = the check itself could not run (no lane in the
// title, no charter, empty Owns section, git failure).

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// One line of the PR body, trimmed. Accepts the bare form and the ways a worker writes it in
// Markdown: a leading list marker (`-`, `*`, `+`, or `1.`/`1)`), and `**` or `__` bold around the
// key or around the whole line (PR #32 wrote "- ownership-exception: ..." and got no credit).
const EXCEPTION_LINE = /^(?:(?:[-*+]|\d+[.)])\s+)?(?:\*\*|__)?\s*ownership-exception:\s*(.*)$/i;

export function laneFromTitle(title) {
  const m = /^\s*([A-Za-z0-9_-]+)\s*:/.exec(title || "");
  return m ? m[1].toLowerCase() : null;
}

export function ownedGlobs(charterText) {
  const lines = charterText.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Owns\s*\(paths\)\s*$/i.test(l.trim()));
  if (start < 0) return [];
  const globs = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    // Parenthesised text on a bullet is prose ("(moved from `prototype/...`)"), not an owned path.
    const line = lines[i].replace(/\([^)]*\)/g, "");
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const g = m[1].trim().replace(/^\.\//, "").replace(/\/$/, "/**");
      if (g) globs.push(g);
    }
  }
  return globs;
}

// Glob to RegExp. `**` = any number of path segments (including none), `*` = anything but `/`,
// `?` = one char that is not `/`, `{a,b}` = alternation. Anchored at both ends; paths are
// repo-relative with forward slashes and no leading `./`.
export function globToRegExp(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; re += "(?:.*/)?"; } // `a/**/b` and `**/b`
        else re += ".*";                                     // trailing `**`
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) { re += "\\{"; continue; }
      re += "(?:" + glob.slice(i + 1, end).split(",").map(escapeRe).join("|") + ")";
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp(re + "$");
}

function escapeRe(s) { return s.replace(/[.+^$()|[\]\\]/g, "\\$&"); }

export function isOwned(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file));
}

export function exceptionReason(body) {
  for (const raw of (body || "").split(/\r?\n/)) {
    const m = EXCEPTION_LINE.exec(raw.trim());
    if (!m) continue;
    // Drop a bold close right after the key ("**ownership-exception:** reason") or at the end.
    const reason = m[1].replace(/^(?:\*\*|__)/, "").replace(/(?:\*\*|__)$/, "").trim();
    return reason || "(no reason given)";
  }
  return null;
}

export function changedFiles(base, head, cwd) {
  const out = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { cwd, encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function check({ title, body, files, repo }) {
  const lane = laneFromTitle(title);
  if (!lane) return { code: 2, lane, lines: [`ownership: cannot read a lane from the PR title ${JSON.stringify(title)}; expected "<lane>: <goal>"`] };
  const charter = path.join(repo, "docs", "agents", "charters", `${lane}.md`);
  if (!existsSync(charter)) return { code: 2, lane, lines: [`ownership: no charter at ${path.relative(repo, charter)} for lane "${lane}"`] };
  const globs = ownedGlobs(readFileSync(charter, "utf8"));
  if (globs.length === 0) return { code: 2, lane, lines: [`ownership: charter for "${lane}" has no globs in its "Owns (paths)" section`] };

  const outside = files.filter((f) => !isOwned(f, globs));
  const reason = exceptionReason(body);
  const lines = [`lane ${lane}: ${globs.length} owned globs (${globs.join(", ")})`];
  for (const f of files) lines.push(`  ${outside.includes(f) ? "OUT " : "ok  "} ${f}`);
  let code = 0;
  if (outside.length === 0) {
    lines.push(`ownership: ok — ${files.length} changed paths, all inside lane ${lane}`);
  } else if (reason !== null) {
    lines.push(`ownership: ok — ${outside.length} of ${files.length} changed paths outside lane ${lane}, allowed by ownership-exception: ${reason}`);
  } else {
    code = 1;
    lines.push(`ownership: FAIL — ${outside.length} of ${files.length} changed paths outside lane ${lane}; add a line "ownership-exception: <reason>" to the PR body or move the files`);
  }
  return { code, lane, outside, reason, lines };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) args[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const repo = path.resolve(args.repo || ".");
  const title = args.title ?? env.PR_TITLE ?? "";
  const body = args["body-file"] ? readFileSync(args["body-file"], "utf8") : (args.body ?? env.PR_BODY ?? "");
  const base = args.base ?? env.BASE_REF;
  const head = args.head ?? env.HEAD_REF ?? "HEAD";
  let files;
  try {
    files = args.files !== undefined ? args.files.split(",").map((s) => s.trim()).filter(Boolean) : changedFiles(base, head, repo);
  } catch (e) {
    console.log(`ownership: git diff ${base}...${head} failed: ${e.message.split("\n")[0]}`);
    process.exit(2);
  }
  if (!base && args.files === undefined) { console.log("ownership: no base ref (--base or BASE_REF)"); process.exit(2); }
  const r = check({ title, body, files, repo });
  console.log(r.lines.join("\n"));
  process.exit(r.code);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main();
