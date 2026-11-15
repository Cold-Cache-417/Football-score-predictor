import assert from "node:assert/strict";
import test from "node:test";

import { mapProviderFixtures } from "../server/lib/provider-snapshot.mjs";

const raw = {
  source: "fotmob",
  competition: "epl",
  providerMatchId: "5795521",
  kickoffUtc: "2026-11-22T16:30:00.000Z",
  status: "scheduled",
  score: { home: null, away: null },
  home: { name: "Liverpool" },
  away: { name: "Manchester United" }
};

test("provider fixtures map to the payload slug shape", () => {
  const out = mapProviderFixtures([raw], { competition: "epl" });
  assert.equal(out.fixtures.length, 1);
  const f = out.fixtures[0];
  assert.equal(f.home, "liv");
  assert.equal(f.away, "mun");
  assert.equal(f.day, "2026-11-22");
  assert.equal(f.id, "p-epl-5795521");
  assert.equal(f.source, "fotmob");
  assert.equal(f.status, "upcoming");
});

test("unknown teams are reported and excluded, never given a slug", () => {
  const out = mapProviderFixtures([{ ...raw, home: { name: "Mystery FC" } }], { competition: "epl" });
  assert.equal(out.fixtures.length, 0);
  assert.equal(out.skipped[0].team, "Mystery FC");
  assert.match(out.skipped[0].reason, /unknown team/);
});

test("mapping never mutates the provider objects", () => {
  const copy = structuredClone(raw);
  mapProviderFixtures([raw], { competition: "epl" });
  assert.deepEqual(raw, copy);
});

test("day is the Madrid calendar day, not the UTC day", () => {
  const out = mapProviderFixtures(
    [{ ...raw, kickoffUtc: "2026-11-22T23:30:00.000Z" }],
    { competition: "epl" }
  );
  assert.equal(out.fixtures[0].day, "2026-11-23");
});

test("a live provider fixture keeps its honest status", () => {
  const out = mapProviderFixtures([{ ...raw, status: "live" }], { competition: "epl" });
  assert.equal(out.fixtures[0].status, "live");
  assert.equal(out.fixtures[0].providerStatus, "live");
});

test("an invalid kickoff is skipped, not guessed", () => {
  const out = mapProviderFixtures([{ ...raw, kickoffUtc: "not-a-date" }], { competition: "epl" });
  assert.equal(out.fixtures.length, 0);
  assert.match(out.skipped[0].reason, /invalid kickoff/);
});
