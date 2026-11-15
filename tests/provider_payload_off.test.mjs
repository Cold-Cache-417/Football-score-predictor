import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/* Flag off is the shipped default. This file never turns it on. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-provider-off-"));
const file = path.join(dir, "provider_fixtures.json");
fs.writeFileSync(
  file,
  JSON.stringify({
    updatedAt: "2026-11-22T00:00:00.000Z",
    competitions: {
      epl: { fixtures: [{ id: "p-epl-must-not-appear", date: "2026-11-22T16:30:00.000Z" }], providers: [], state: {} }
    }
  })
);
process.env.CALIBRA_PROVIDER_SNAPSHOT = file;
delete process.env.COMPETITIONS;

const { buildPayload } = await import("../server/lib/data.mjs");

test("default payload is the la liga payload", () => {
  const payload = buildPayload();
  assert.equal(payload.meta.league, "La Liga");
  assert.equal(payload.meta.competition, undefined);
  assert.equal(payload.fixtures.length, 379);
});

test("competition=epl is ignored while the flag is off", () => {
  const plain = buildPayload();
  const asked = buildPayload({ competition: "epl" });
  assert.equal(asked.fixtures.length, plain.fixtures.length);
  assert.deepEqual(asked.fixtures.map((f) => f.id), plain.fixtures.map((f) => f.id));
  assert.equal(asked.meta.competition, undefined);
  assert.ok(!asked.fixtures.some((f) => f.id === "p-epl-must-not-appear"));
});
