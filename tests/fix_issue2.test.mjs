import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("Issue 2: the stale warning has a real element and is rendered at boot", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "web/fixtures.html"), "utf8");
  assert.match(html, /id="stale-warning"/, "fixtures.html MUST contain the stale-warning element");

  const appJs = fs.readFileSync(path.join(process.cwd(), "web/assets/js/app.js"), "utf8");
  assert.match(appJs, /getElementById\("stale-warning"\)/, "app.js MUST target the stale-warning element");
  assert.match(appJs, /function renderStaleWarning\(\)/, "app.js MUST define renderStaleWarning");
  /* The warning must not depend on provider attribution links existing:
     a stale snapshot with no usable provider still has to warn the reader. */
  assert.match(
    appJs,
    /renderStaleWarning\(\);\s*\n\s*initCompetitionSwitch\(\);/,
    "renderStaleWarning MUST run at boot, not only inside renderAttribution"
  );
});
