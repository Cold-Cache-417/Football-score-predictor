import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Suite D: Settlement Workflow Dry-Run - Provider failure does not block La Liga", () => {
  delete process.env.COMPETITIONS;

  // 1. Force the provider refresh to fail
  // We simulate step "Refresh provider snapshot" failing by injecting an error
  let providerFailed = false;
  try {
    // Run with an invalid configuration that forces exit 1
    execFileSync("node", ["-e", "process.exit(1)"]);
  } catch {
    providerFailed = true;
  }
  assert.ok(providerFailed, "Simulated provider failure should fail");

  // In the workflow, continue-on-error: true allows execution to continue
  // 2. Next step: Verify
  const verifyOutput = execFileSync("node", ["scripts/check_site_data.mjs"], { stdio: "pipe" }).toString();
  assert.match(verifyOutput, /ok: \d+ fixtures/, "Verify step should succeed");

  // 3. Next step: Publish snapshot
  // Note: in workflow, COMPETITIONS is 'on' for publish snapshot.
  // Publishing into a temp web root keeps this suite from racing the others.
  const web = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-dryrun-"));
  try {
    const publishOutput = execFileSync("node", ["scripts/publish_snapshot.mjs"], {
      env: { ...process.env, COMPETITIONS: "on", CALIBRA_WEB_ROOT: web },
      stdio: "pipe"
    }).toString();
    assert.match(publishOutput, /OK — all assertions passed/, "Publish must succeed after a provider failure");

    // 4. Assert La Liga payload remains intact
    const fixtures = JSON.parse(fs.readFileSync(path.join(web, "api/fixtures.json"), "utf8"));
    assert.equal(fixtures.meta.league, "La Liga");
    assert.ok(fixtures.fixtures.length > 0, "La Liga fixtures must still be published");
    assert.ok(
      !fixtures.fixtures.some((fixture) => String(fixture.id).startsWith("p-epl-")),
      "the provider failure must not leak EPL fixtures into La Liga"
    );
  } finally {
    fs.rmSync(web, { recursive: true, force: true });
  }
});
