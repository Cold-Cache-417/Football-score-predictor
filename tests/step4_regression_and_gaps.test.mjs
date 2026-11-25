import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildPayload } from "../server/lib/data.mjs";
import { getCompetition } from "../server/lib/competitions.mjs";

test("Gap 1: Cross-League Separation - EPL fixtures cannot acquire La Liga forecasts", async () => {
  // Turn on COMPETITIONS dynamically for this test
  process.env.COMPETITIONS = "on";

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-gap1-"));
  const mockSnapshot = path.join(tmpDir, "provider_fixtures.json");

  // Create a provider fixture that uses slugs matching La Liga (e.g. "bar" vs "rma")
  // but explicitly assigned to "epl"
  fs.writeFileSync(
    mockSnapshot,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      competitions: {
        epl: {
          fetchedAt: new Date().toISOString(),
          providers: [{ id: "fotmob", name: "FotMob", url: "https://fotmob.com" }],
          state: { stale: false },
          fixtures: [
            {
              id: "p-epl-collision-test",
              day: "2026-11-22",
              date: "2026-11-22T16:30:00.000Z",
              home: "bar", // Barcelona (La Liga slug)
              away: "rma", // Real Madrid (La Liga slug)
              status: "upcoming",
              source: "fotmob",
              provider: "fotmob",
              providerMatchId: "collision-test",
              score: null
            }
          ]
        }
      }
    })
  );

  process.env.CALIBRA_PROVIDER_SNAPSHOT = mockSnapshot;

  // Import freshly with flag=on
  const { buildPayload: buildPayloadOn } = await import("../server/lib/data.mjs?gap1=1");
  const eplPayload = buildPayloadOn({ competition: "epl" });

  const collided = eplPayload.fixtures.find((f) => f.id === "p-epl-collision-test");
  assert.ok(collided, "EPL fixture should exist");
  assert.equal(collided.archived, undefined, "EPL fixture MUST NOT acquire La Liga forecasts, even with matching slugs");

  delete process.env.COMPETITIONS;
  delete process.env.CALIBRA_PROVIDER_SNAPSHOT;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* The publish script writes into a throwaway web root here, so this test can
   run alongside the other publish suites without racing on web/ artefacts. */
test("Gap 3: ON -> OFF transition removes the EPL page but keeps the API route answered", () => {
  const web = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-gap3-web-"));
  const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-gap3-snap-"));
  const snapPath = path.join(snapDir, "provider_fixtures.json");
  fs.writeFileSync(
    snapPath,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      competitions: {
        epl: {
          fetchedAt: new Date().toISOString(),
          providers: [],
          state: { stale: false },
          fixtures: [
            { id: "p-epl-1", date: "2026-11-22T16:30:00.000Z", home: "liv", away: "mun", status: "upcoming" }
          ]
        }
      }
    })
  );

  const baseEnv = { ...process.env, CALIBRA_WEB_ROOT: web, CALIBRA_PROVIDER_SNAPSHOT: snapPath };
  try {
    execFileSync("node", ["scripts/publish_snapshot.mjs"], {
      env: { ...baseEnv, COMPETITIONS: "on" },
      stdio: "pipe"
    });

    assert.ok(fs.existsSync(path.join(web, "epl.html")), "epl.html should be created when the flag is ON");
    assert.ok(fs.existsSync(path.join(web, "api/fixtures-epl.json")), "fixtures-epl.json should be created when the flag is ON");
    assert.ok(fs.existsSync(path.join(web, "api/bootstrap-epl.js")), "bootstrap-epl.js should be created when the flag is ON");

    const offEnv = { ...baseEnv };
    delete offEnv.COMPETITIONS;
    execFileSync("node", ["scripts/publish_snapshot.mjs"], { env: offEnv, stdio: "pipe" });

    assert.ok(!fs.existsSync(path.join(web, "epl.html")), "epl.html MUST be deleted when the flag turns OFF");
    assert.ok(!fs.existsSync(path.join(web, "api/bootstrap-epl.js")), "bootstrap-epl.js MUST be deleted when the flag turns OFF");
    const body = path.join(web, "api/fixtures-epl.json");
    assert.ok(fs.existsSync(body), "the static rewrite must still have a body to serve");
    assert.equal(JSON.parse(fs.readFileSync(body, "utf8")).error.code, "COMPETITION_DISABLED");
  } finally {
    fs.rmSync(web, { recursive: true, force: true });
    fs.rmSync(snapDir, { recursive: true, force: true });
  }
});

/* A fixture that has settled must not also appear as upcoming in the same
   matchweek. Stale prediction exports carry a placeholder date, so their id
   differs from the settled row and only a matchweek+teams check catches them. */
test("no fixture is both settled and upcoming in the same matchweek", () => {
  delete process.env.COMPETITIONS;
  delete process.env.CALIBRA_PROVIDER_SNAPSHOT;

  const payload = buildPayload();
  const settledSlots = new Set(
    payload.fixtures
      .filter((fixture) => fixture.status === "result" && fixture.mw)
      .map((fixture) => `${fixture.mw}|${fixture.home}|${fixture.away}`)
  );
  const phantoms = payload.fixtures.filter(
    (fixture) =>
      fixture.status !== "result" &&
      fixture.mw &&
      settledSlots.has(`${fixture.mw}|${fixture.home}|${fixture.away}`)
  );
  assert.deepEqual(phantoms.map((fixture) => fixture.id), []);
});

/* The absolute golden hash from Step 2 cannot be a permanent assertion: the
   results export and ledger both grow with every settlement, so the payload
   changes by design. What must never change is that enabling the competition
   layer leaves the default La Liga payload untouched. */
test("Enabling competitions leaves the default La Liga payload byte-identical", () => {
  delete process.env.COMPETITIONS;
  process.env.CALIBRA_PROVIDER_SNAPSHOT = path.join(os.tmpdir(), `calibra-golden-missing-${process.pid}.json`);

  const strip = (value) => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value).sort()) {
        if (key === "generatedAt") continue;
        out[key] = strip(value[key]);
      }
      return out;
    }
    return value;
  };

  try {
    const off = strip(buildPayload());
    process.env.COMPETITIONS = "on";
    const on = strip(buildPayload());

    assert.equal(off.meta.league, "La Liga");
    assert.equal(off.meta.competition, undefined);
    assert.deepEqual(on, off, "the flag must not alter the La Liga payload");
    assert.ok(
      !off.fixtures.some((fixture) => String(fixture.id).startsWith("p-epl-")),
      "no EPL fixture may leak into the La Liga payload"
    );
  } finally {
    delete process.env.COMPETITIONS;
    delete process.env.CALIBRA_PROVIDER_SNAPSHOT;
  }
});
