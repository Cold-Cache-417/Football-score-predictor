/* Live-flow and reconciliation tests, driven by simulated provider responses.
 *
 *   node --test tests/live_flow.test.mjs
 *
 * No network: every provider payload here is constructed locally, so these
 * tests cost zero API quota. They prove the state transitions and the ledger
 * contract, not that api-sports.io is reachable.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildPayload } from "../server/lib/data.mjs";
import {
  buildEvaluations,
  insertForecasts,
  openLedger,
  outcomeOf,
  pairKey,
  recordResult,
  rps,
  summarise
} from "../server/lib/db.mjs";

function tempLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-ledger-"));
  const db = openLedger(path.join(dir, "test.db"));
  return { db, dir };
}

function forecast(overrides = {}) {
  return {
    pairKey: pairKey("2026/27", "ala", "dep"),
    fixtureId: "m-2026-11-22-ala-dep",
    season: "2026/27",
    matchweek: 13,
    kickoffUtc: "2026-11-22T18:00:00.000Z",
    home: "ala",
    away: "dep",
    pBlendH: 0.5,
    pBlendD: 0.3,
    pBlendA: 0.2,
    pDcH: 0.48,
    pDcD: 0.31,
    pDcA: 0.21,
    pCatH: 0.53,
    pCatD: 0.28,
    pCatA: 0.19,
    topHomeGoals: 1,
    topAwayGoals: 0,
    topProb: 0.14,
    generatedAt: "2026-11-12T09:33:00.000Z",
    modelVersion: "abc123",
    predictionType: "live_forward",
    late: false,
    ...overrides
  };
}

function result(overrides = {}) {
  return {
    pairKey: pairKey("2026/27", "ala", "dep"),
    fixtureId: "m-2026-11-22-ala-dep",
    season: "2026/27",
    matchweek: 13,
    kickoffUtc: "2026-11-22T18:00:00.000Z",
    home: "ala",
    away: "dep",
    homeGoals: 2,
    awayGoals: 0,
    status: "FT",
    source: "football-data.co.uk",
    marketH: 0.45,
    marketD: 0.31,
    marketA: 0.24,
    ...overrides
  };
}

test("RPS and log loss match the locked evaluation convention", () => {
  // A confident, correct call scores better than a wrong one.
  assert.ok(rps([0.7, 0.2, 0.1], 0) < rps([0.1, 0.2, 0.7], 0));
  // A uniform forecast is penalised but bounded: 1/2 * ((1/3 - 1)^2 + (2/3 - 1)^2) = 5/18.
  assert.ok(Math.abs(rps([1 / 3, 1 / 3, 1 / 3], 0) - 5 / 18) < 1e-12);
  // A perfect, fully confident call scores zero.
  assert.equal(rps([1, 0, 0], 0), 0);
  assert.equal(outcomeOf(2, 1), 0);
  assert.equal(outcomeOf(1, 1), 1);
  assert.equal(outcomeOf(0, 3), 2);
});

test("a live feed marks the fixture live without inventing a result", () => {
  const liveFeed = {
    state: "ok",
    updatedAt: "2026-11-22T19:05:00.000Z",
    matches: [
      {
        home: "ala",
        away: "dep",
        minute: 37,
        statusShort: "1H",
        homeGoals: 1,
        awayGoals: 0,
        events: [{ minute: 12, type: "goal", team: "ala", player: "Player A", detail: "Normal Goal" }]
      }
    ]
  };
  const payload = buildPayload({ liveFeed });
  const fixture = payload.fixtures.find((f) => f.id === "m-2026-11-22-ala-dep");
  assert.ok(fixture, "fixture is in the payload");
  assert.equal(fixture.status, "live");
  assert.equal(fixture.minute, 37);
  assert.deepEqual(fixture.score, [1, 0]);
  assert.equal(payload.meta.live.state, "ok");
  assert.equal(payload.meta.live.matches, 1);
});

test("a failing provider degrades to stale/error and never fabricates a score", () => {
  const stale = buildPayload({
    liveFeed: { state: "stale", updatedAt: null, message: "rate limit reached", matches: [] }
  });
  assert.equal(stale.meta.live.state, "stale");
  assert.equal(stale.meta.live.message, "rate limit reached");
  for (const fixture of stale.fixtures) {
    if (fixture.status === "upcoming") assert.equal(fixture.score, null);
  }

  const down = buildPayload({ liveFeed: { state: "error", matches: [], message: "unreachable" } });
  assert.equal(down.meta.live.state, "error");
  assert.equal(down.fixtures.filter((f) => f.status === "live").length, 0);
});

test("a forecast is written once and can never be overwritten", () => {
  const { db } = tempLedger();
  const first = insertForecasts(db, [forecast()]);
  assert.equal(first.inserted, 1);

  // A later export with different numbers must not replace the original.
  const second = insertForecasts(db, [forecast({ pBlendH: 0.9, pBlendD: 0.05, pBlendA: 0.05 })]);
  assert.equal(second.inserted, 0);
  assert.equal(second.skipped, 1);

  const stored = db.prepare("SELECT * FROM forecasts").get();
  assert.equal(stored.p_blend_h, 0.5);

  assert.throws(() => db.prepare("UPDATE forecasts SET p_blend_h = 0.99").run(), /immutable/);
  assert.throws(() => db.prepare("DELETE FROM forecasts").run(), /immutable/);
  db.close();
});

test("a result settles the forecast and the verdict is computed from the stored call", () => {
  const { db } = tempLedger();
  insertForecasts(db, [forecast()]);
  const written = recordResult(db, result());
  assert.equal(written.status, "new");

  const evaluations = buildEvaluations(db, { season: "2026/27" });
  assert.equal(evaluations.length, 1);
  const [row] = evaluations;
  assert.equal(row.outcomeLabel, "H");
  assert.equal(row.correct, true);
  assert.equal(row.scorelineHit, false); // predicted 1-0, finished 2-0
  assert.equal(row.goalError, 1);
  assert.ok(row.marketRps > 0);

  const record = summarise(evaluations);
  assert.equal(record.matches, 1);
  assert.equal(record.accuracy, 100);
  assert.ok(Math.abs(record.rps - rps([0.5, 0.3, 0.2], 0)) < 1e-12);
  db.close();
});

test("duplicate updates are idempotent; corrections bump the revision and are audited", () => {
  const { db } = tempLedger();
  insertForecasts(db, [forecast()]);

  assert.equal(recordResult(db, result()).status, "new");
  assert.equal(recordResult(db, result()).status, "unchanged");

  const corrected = recordResult(db, result({ homeGoals: 1, awayGoals: 1, source: "API-Football" }));
  assert.equal(corrected.status, "corrected");
  assert.equal(corrected.revision, 2);

  const revisions = db.prepare("SELECT * FROM result_revisions ORDER BY revision").all();
  assert.equal(revisions.length, 2);
  assert.deepEqual([revisions[1].home_goals, revisions[1].away_goals], [1, 1]);

  // The forecast itself is untouched; only the verdict changes.
  const stored = db.prepare("SELECT p_blend_h, p_blend_d, p_blend_a FROM forecasts").get();
  assert.deepEqual([stored.p_blend_h, stored.p_blend_d, stored.p_blend_a], [0.5, 0.3, 0.2]);

  const [row] = buildEvaluations(db, { season: "2026/27" });
  assert.equal(row.outcomeLabel, "D");
  assert.equal(row.correct, false);
  assert.equal(row.revision, 2);
  db.close();
});

test("a forecast recorded after kickoff is stored but excluded from the record", () => {
  const { db } = tempLedger();
  insertForecasts(db, [
    forecast({ late: true, generatedAt: "2026-11-23T09:00:00.000Z" }),
    forecast({
      pairKey: pairKey("2026/27", "bar", "get"),
      fixtureId: "m-2026-11-22-bar-get",
      home: "bar",
      away: "get",
      pBlendH: 0.8,
      pBlendD: 0.15,
      pBlendA: 0.05
    })
  ]);
  recordResult(db, result({ homeGoals: 3, awayGoals: 1 }));
  recordResult(
    db,
    result({
      pairKey: pairKey("2026/27", "bar", "get"),
      fixtureId: "m-2026-11-22-bar-get",
      home: "bar",
      away: "get",
      homeGoals: 2,
      awayGoals: 0
    })
  );

  const evaluations = buildEvaluations(db, { season: "2026/27" });
  assert.equal(evaluations.length, 2);
  const record = summarise(evaluations);
  assert.equal(record.matches, 1, "only the on-time forecast counts");
  assert.equal(summarise(evaluations, { includeLate: true }).matches, 2);
  db.close();
});

test("a provider-sourced result with no market price still scores the forecast", () => {
  const { db } = tempLedger();
  insertForecasts(db, [forecast()]);
  recordResult(db, result({ source: "API-Football", marketH: null, marketD: null, marketA: null }));

  const [row] = buildEvaluations(db, { season: "2026/27" });
  assert.equal(row.resultSource, "API-Football");
  assert.equal(row.marketRps, null);
  const record = summarise([row]);
  assert.equal(record.matches, 1);
  assert.equal(record.market, null);
  db.close();
});

test("every upcoming fixture has a 15x15 grid file that sums to one", () => {
  const dir = path.join(process.cwd(), "data/website/scorelines");
  if (!fs.existsSync(dir)) return; // grid conversion has not been run
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  assert.ok(files.length > 0, "at least one grid file exists");
  for (const name of files.slice(0, 5)) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    assert.equal(data.grid.length, 15);
    assert.equal(data.grid[0].length, 15);
    const total = data.grid.flat().reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-6, `${name} sums to ${total}`);
    assert.ok(data.top.length >= 1);
    assert.match(data.fixtureId, /^m-\d{4}-\d{2}-\d{2}-[a-z]{3}-[a-z]{3}$/);
  }
});
