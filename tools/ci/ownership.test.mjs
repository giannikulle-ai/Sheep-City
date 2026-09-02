// Unit tests for the lane ownership check. Run: node --test "tools/ci/*.test.mjs" (part of `npm run test`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { exceptionReason, laneFromTitle, ownedGlobs, isOwned, check } from "./ownership.mjs";

test("exceptionReason: bare line", () => {
  assert.equal(exceptionReason("Closes #1\n\nownership-exception: the ticket allows it\n"), "the ticket allows it");
  assert.equal(exceptionReason("Ownership-Exception:   spaced  "), "spaced");
  assert.equal(exceptionReason("ownership-exception:"), "(no reason given)");
});

test("exceptionReason: Markdown list item (PR #32 wrote it this way)", () => {
  assert.equal(exceptionReason("- ownership-exception: charter bench line, granted by the Foreman"), "charter bench line, granted by the Foreman");
  assert.equal(exceptionReason("* ownership-exception: star"), "star");
  assert.equal(exceptionReason("+ ownership-exception: plus"), "plus");
  assert.equal(exceptionReason("1. ownership-exception: numbered"), "numbered");
  assert.equal(exceptionReason("2) ownership-exception: numbered paren"), "numbered paren");
  assert.equal(exceptionReason("  - ownership-exception: indented"), "indented");
});

test("exceptionReason: bold key or bold line, with or without a list marker", () => {
  assert.equal(exceptionReason("**ownership-exception:** bold key"), "bold key");
  assert.equal(exceptionReason("**ownership-exception: bold line**"), "bold line");
  assert.equal(exceptionReason("- **ownership-exception:** bulleted bold key"), "bulleted bold key");
  assert.equal(exceptionReason("__ownership-exception:__ underscores"), "underscores");
});

test("exceptionReason: no credit for a mention that is not the line", () => {
  assert.equal(exceptionReason(""), null);
  assert.equal(exceptionReason(null), null);
  assert.equal(exceptionReason("add an ownership-exception: line if needed"), null);
  assert.equal(exceptionReason("`ownership-exception:` is the format"), null);
  assert.equal(exceptionReason("-ownership-exception: no space after the marker"), null);
});

test("laneFromTitle and ownedGlobs", () => {
  assert.equal(laneFromTitle("infra: CI re-runs on PR body edits"), "infra");
  assert.equal(laneFromTitle("Art : caps"), "art");
  assert.equal(laneFromTitle("no lane here"), null);
  const globs = ownedGlobs("# x\n## Owns (paths)\n- `tools/art/**` (moved from `prototype/x/`)\n- `package.json`\n## Never touches\n- `everything`\n");
  assert.deepEqual(globs, ["tools/art/**", "package.json"]);
  assert.ok(isOwned("tools/art/a/b.py", globs));
  assert.ok(!isOwned("docs/x.md", globs));
});

test("check: an outside path fails without the line and passes with a bulleted one", () => {
  const files = [".github/workflows/ci.yml", "docs/AGENT_FRAMEWORK.md"];
  const title = "infra: x";
  const repo = new URL("../..", import.meta.url).pathname;
  assert.equal(check({ title, body: "", files, repo }).code, 1);
  const ok = check({ title, body: "- ownership-exception: allowed by issue #35", files, repo });
  assert.equal(ok.code, 0);
  assert.equal(ok.reason, "allowed by issue #35");
});
