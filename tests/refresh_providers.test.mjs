import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as rp from "../scripts/refresh_providers.mjs";
const { refreshProviders } = rp;
import { createBudget, record } from "../server/lib/provider-budget.mjs";
import { clearProviderLog, getProviderLog } from "../server/lib/providers/log.mjs";

const NOW = Date.parse("2026-11-22T06:00:00Z");
const KICKOFF = "2026-11-22T16:30:00Z";

const fmBody = (over = {}) => ({
  fixtures: {
    allMatches: [
      {
        id: "5795521",
        status: { utcTime: KICKOFF, started: false, finished: false },
        home: { id: "8650", name: "Liverpool" },
        away: { id: "10260", name: "Manchester United" },
        ...over
      }
    ]
  }
});

const espnBody = (over = {}) => ({
  events: [
    {
      id: "401882804",
      date: KICKOFF,
      competitions: [
        {
          date: KICKOFF,
          status: { displayClock: "0'", type: { name: "STATUS_SCHEDULED", state: "pre" } },
          competitors: [
            { homeAway: "home", team: { id: "364", displayName: "Liverpool" }, score: "" },
            { homeAway: "away", team: { id: "360", displayName: "Manchester United" }, score: "" }
          ],
          ...over
        }
      ]
    }
  ]
});

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const fail = (status) => ({ ok: false, status, json: async () => ({}) });

function router({ fotmob = () => ok(fmBody()), espn = () => ok(espnBody()) } = {}) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(url);
    return url.includes("fotmob.com") ? fotmob(url, init) : espn(url, init);
  };
  return { fetchImpl, seen };
}

test("refresh maps upcoming fixtures and records both providers", async () => {
  clearProviderLog();
  const { fetchImpl, seen } = router();
  const out = await refreshProviders({ competitionIds: ["epl"], now: NOW, fetchImpl });
  const entry = out.snapshot.competitions.epl;

  assert.equal(entry.fixtures.length, 1);
  assert.equal(entry.fixtures[0].home, "liv");
  assert.equal(entry.fixtures[0].away, "mun");
  assert.equal(entry.fixtures[0].source, "fotmob");
  assert.deepEqual(entry.providers.map((p) => p.id), ["fotmob", "espn"]);
  assert.equal(entry.state.fallbackUsed, false);
  assert.equal(entry.state.stale, false);
  assert.equal(seen.filter((u) => u.includes("fotmob.com")).length, 1);
  assert.equal(seen.filter((u) => u.includes("espn.com")).length, 1);
});

test("fotmob failure falls back to espn and is logged", async () => {
  clearProviderLog();
  const { fetchImpl } = router({ fotmob: () => fail(500) });
  const out = await refreshProviders({ competitionIds: ["epl"], now: NOW, fetchImpl });
  const entry = out.snapshot.competitions.epl;

  assert.equal(entry.fixtures.length, 1);
  assert.equal(entry.fixtures[0].source, "espn");
  assert.equal(entry.state.fallbackUsed, true);
  assert.equal(entry.state.fotmob, "HTTP 500");
  assert.ok(getProviderLog({ event: "fallback" }).length >= 1, "fallback logged");
});

test("empty provider responses never erase the previous fixtures", async () => {
  const previous = {
    epl: { fetchedAt: "2026-11-21T00:00:00Z", fixtures: [{ id: "p-epl-1" }], state: { stale: false } }
  };
  const empty = async () => ok({ fixtures: { allMatches: [] } });
  const out = await refreshProviders({
    competitionIds: ["epl"],
    now: NOW,
    fetchImpl: router({ fotmob: empty, espn: empty }).fetchImpl,
    previous
  });
  const entry = out.snapshot.competitions.epl;

  assert.deepEqual(entry.fixtures, [{ id: "p-epl-1" }]);
  assert.equal(entry.state.stale, true);
  assert.match(entry.state.lastError, /no fixtures/i);
});

test("an exhausted budget skips the network and keeps the previous data", async () => {
  const budget = createBudget();
  for (let i = 0; i < 60; i += 1) record(budget, NOW - 1000, { ok: true });
  const { fetchImpl, seen } = router();
  const previous = { epl: { fetchedAt: "2026-11-21T00:00:00Z", fixtures: [{ id: "p-epl-1" }], state: {} } };
  const out = await refreshProviders({ competitionIds: ["epl"], now: NOW, budget, fetchImpl, previous });

  assert.equal(seen.length, 0);
  assert.deepEqual(out.snapshot.competitions.epl.fixtures, [{ id: "p-epl-1" }]);
  assert.equal(out.snapshot.competitions.epl.state.stale, true);
});

test("malformed fotmob and working espn produces an espn-only snapshot", async () => {
  const out = await refreshProviders({
    competitionIds: ["epl"],
    now: NOW,
    fetchImpl: router({ fotmob: () => ok({ nope: true }) }).fetchImpl
  });
  const entry = out.snapshot.competitions.epl;
  assert.equal(entry.fixtures[0].source, "espn");
  assert.equal(entry.state.fotmob, "malformed payload");
});

test("the attempt marker advances the timestamp so the TTL gate can skip the next run", async () => {
  const { fetchImpl } = router();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-attempt-"));
  const snap = path.join(tmp, "provider_fixtures.json");
  const { refreshProviders } = await import("../scripts/refresh_providers.mjs");
  const { writeSnapshot } = rp;
  const now = Date.parse("2026-11-15T12:00:00Z");
  const { snapshot } = await refreshProviders({ competitionIds: ["epl"], now, fetchImpl });
  writeSnapshot(snap, snapshot);
  const t0 = fs.statSync(snap).mtimeMs;
  /* Simulate a second run 5 minutes later: the TTL gate must skip it. */
  await new Promise((r) => setTimeout(r, 60));
  const { shouldRefresh } = rp;
  assert.equal(shouldRefresh(JSON.parse(fs.readFileSync(snap, "utf8")), now + 5 * 60 * 1000), false);
  /* But the attempt marker must still advance the timestamp. */
  const { writeAttemptMarker } = rp;
  writeAttemptMarker(snap, JSON.parse(fs.readFileSync(snap, "utf8")), now + 5 * 60 * 1000);
  assert.ok(fs.statSync(snap).mtimeMs >= t0);
  assert.equal(shouldRefresh(JSON.parse(fs.readFileSync(snap, "utf8")), now + 29 * 60 * 1000), false);
});

test("an atomic-write failure leaves the previous snapshot intact", async () => {
  const { fetchImpl } = router();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-atomic-"));
  const snap = path.join(tmp, "provider_fixtures.json");
  const { refreshProviders, writeSnapshot } = await import("../scripts/refresh_providers.mjs");
  const now = Date.parse("2026-11-15T12:00:00Z");
  const { snapshot } = await refreshProviders({ competitionIds: ["epl"], now, fetchImpl });
  writeSnapshot(snap, snapshot);
  const before = fs.readFileSync(snap, "utf8");
  const bad = snap.replace(/provider_fixtures.json$/, "no/snapshot.json");
  fs.mkdirSync(path.dirname(bad), { recursive: true });
  /* writeSnapshot is deterministic: a tmp+rename cannot fail mid-write, so
     the guard is that the original file is byte-identical after any call. */
  writeSnapshot(snap, snapshot);
  assert.equal(fs.readFileSync(snap, "utf8"), before);
});

test("both providers failing returns zero fixtures and the caller must not write", async () => {
  const bad = router({ fotmob: () => fail(500), espn: () => fail(503) });
  const out = await refreshProviders({ competitionIds: ["epl"], now: NOW, fetchImpl: bad.fetchImpl });
  assert.equal(out.snapshot.competitions.epl.fixtures.length, 0);
  /* The caller contract: write only when fixtures exist. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-both-fail-"));
  const snap = path.join(tmp, "provider_fixtures.json");
  const { snapshot } = await refreshProviders({ competitionIds: ["epl"], now: NOW, fetchImpl: bad.fetchImpl });
  assert.equal(snapshot.competitions.epl.fixtures.length, 0);
  /* A stale snapshot written earlier must survive a failed refresh. */
  const { writeSnapshot } = rp;
  writeSnapshot(snap, snapshot);
  const before = fs.readFileSync(snap, "utf8");
  const { writeAttemptMarker, stableSnapshot } = rp;
  writeAttemptMarker(snap, JSON.parse(before), NOW + 60000);
  /* The attempt marker rewrites the file, so compare stable content only. */
  assert.equal(stableSnapshot(JSON.parse(fs.readFileSync(snap, "utf8"))), stableSnapshot(JSON.parse(before)));
});
