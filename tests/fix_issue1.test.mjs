import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/* The static host cannot answer 404 for /api/fixtures/epl because vercel.json
   rewrites it to a real file, so flag-off must publish a 200 body with an
   explicit COMPETITION_DISABLED error instead of leaving the route dangling. */
test("Issue 1: flag-off publish keeps /api/fixtures/epl a 200 COMPETITION_DISABLED body", () => {
  const web = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-issue1-"));
  const env = { ...process.env, CALIBRA_WEB_ROOT: web };
  delete env.COMPETITIONS;
  try {
    execFileSync("node", ["scripts/publish_snapshot.mjs"], { env, stdio: "pipe" });

    const body = path.join(web, "api/fixtures-epl.json");
    assert.ok(fs.existsSync(body), "the rewritten route must keep answering");
    const parsed = JSON.parse(fs.readFileSync(body, "utf8"));
    assert.equal(parsed.error.code, "COMPETITION_DISABLED");
    assert.match(parsed.error.message, /not published/);

    assert.ok(!fs.existsSync(path.join(web, "epl.html")), "flag-off must not publish the EPL page");
    assert.ok(!fs.existsSync(path.join(web, "api/bootstrap-epl.js")), "flag-off must not publish the EPL bootstrap");
  } finally {
    fs.rmSync(web, { recursive: true, force: true });
  }
});
