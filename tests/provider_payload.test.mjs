import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-provider-"));
const file = path.join(dir, "provider_fixtures.json");
const fixture = {
  id: "p-epl-5795521",
  mw: null,
  day: "2026-11-22",
  date: "2026-11-22T16:30:00.000Z",
  timeTBC: false,
  home: "liv",
  away: "mun",
  venue: "",
  status: "upcoming",
  source: "fotmob",
  provider: "fotmob",
  providerMatchId: "5795521",
  score: null,
  xg: null,
  p: null
};
fs.writeFileSync(
  file,
  JSON.stringify({
    updatedAt: "2026-11-22T00:00:00.000Z",
    competitions: {
      epl: {
        fetchedAt: "2026-11-22T00:00:00.000Z",
        providers: [
          { id: "fotmob", name: "FotMob", url: "https://www.fotmob.com", role: "primary" },
          { id: "espn", name: "ESPN", url: "https://www.espn.com/soccer/", role: "cross-check" }
        ],
        state: { fotmob: "ok", espn: "ok", fallbackUsed: false, stale: false, conflicts: 0,
                 lastAttemptAt: new Date().toISOString() },
        fixtures: [fixture],
        skipped: [{ team: "Mystery FC", reason: "unknown team" }],
        conflicts: []
      }
    }
  })
);
process.env.CALIBRA_PROVIDER_SNAPSHOT = file;
const before = JSON.stringify(fs.readFileSync(file, "utf8"));

process.env.COMPETITIONS = "on";
const dataOn = await import("../server/lib/data.mjs?flag=on");

test("flag on appends epl fixtures with competition and provider metadata", () => {
  const payload = dataOn.buildPayload({ competition: "epl" });
  const ids = payload.fixtures.map((f) => f.id);
  assert.ok(ids.includes("p-epl-5795521"));
  assert.equal(payload.meta.competition.id, "epl");
  assert.equal(payload.meta.league, "Premier League");
  assert.equal(payload.meta.providers.length, 2);
  assert.equal(payload.meta.providerState.stale, false);
  assert.equal(payload.meta.skipped[0].team, "Mystery FC");
  assert.equal(payload.meta.matches.upcoming, 1);
  assert.equal(payload.fixtures.length, 1, "no la liga fixtures leak into the epl payload");
  assert.equal(payload.meta.matches.settled, 0);
  assert.ok(payload.meta.warnings.every((w) => !/forecast export/i.test(w)));
});

test("la liga stays untouched even with the flag on", () => {
  const laliga = dataOn.buildPayload();
  assert.equal(laliga.meta.league, "La Liga");
  assert.equal(laliga.meta.competition, undefined);
  assert.equal(laliga.fixtures.length, 379);
});

test("the cached snapshot is never mutated by payload building", () => {
  dataOn.buildPayload({ competition: "epl" });
  assert.equal(JSON.stringify(fs.readFileSync(file, "utf8")), before);
});

test("a missing snapshot degrades to an explicit unavailable state", () => {
  process.env.CALIBRA_PROVIDER_SNAPSHOT = path.join(dir, "missing.json");
  return import("../server/lib/data.mjs?flag=on-missing").then((mod) => {
    const payload = mod.buildPayload({ competition: "epl" });
    assert.equal(payload.meta.providers.length, 0);
    assert.equal(payload.meta.providerState.stale, true);
    assert.ok(payload.meta.warnings.some((w) => /could not be refreshed/.test(w)));
  });
});

test("a stale attempt marker reports stale=true", () => {
  const stale = JSON.parse(fs.readFileSync(file, "utf8"));
  stale.competitions.epl.state.lastAttemptAt = "2026-11-15T00:00:00.000Z";
  fs.writeFileSync(file, JSON.stringify(stale));
  const payload = dataOn.buildPayload({ competition: "epl" });
  assert.equal(payload.meta.providerState.stale, true);
  assert.ok(payload.meta.warnings.some((w) => /could not be refreshed/.test(w)));
});
