/* Phase 4A provider layer tests. No network: every response is simulated. */

import assert from "node:assert/strict";
import test from "node:test";

import { competitionsEnabled, getCompetition, listCompetitions } from "../server/lib/competitions.mjs";
import { fetchJson } from "../server/lib/providers/http.mjs";
import { clearProviderLog, getProviderLog } from "../server/lib/providers/log.mjs";
import { getFixtures as fotmobFixtures } from "../server/lib/providers/fotmob.mjs";
import { getFixtures as espnFixtures, getSummary } from "../server/lib/providers/espn.mjs";
import { reconcile, withFallback } from "../server/lib/reconcile.mjs";

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const opts = { deps: { fetchImpl: async () => json({}) } };

test("competition registry is read-only and flag defaults off", () => {
  assert.equal(competitionsEnabled({}), false);
  assert.equal(competitionsEnabled({ COMPETITIONS: "on" }), true);
  assert.equal(getCompetition().id, "laliga");
  assert.equal(getCompetition("epl").providers.fotmob.leagueId, 47);
  assert.deepEqual(listCompetitions().map((c) => c.id), ["laliga", "epl"]);
  assert.throws(() => getCompetition("nope"), /unknown competition/);
});

test("http helper records HTTP failures, malformed JSON and network errors", async () => {
  clearProviderLog();
  const http = await fetchJson("https://x.test/a", { provider: "fotmob", fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  assert.equal(http.ok, false);
  assert.match(http.error, /503/);
  const bad = await fetchJson("https://x.test/b", { provider: "fotmob", fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }) });
  assert.equal(bad.error, "malformed JSON");
  const down = await fetchJson("https://x.test/c", { provider: "espn", fetchImpl: async () => { throw new Error("boom"); } });
  assert.equal(down.error, "network error");
  assert.deepEqual(getProviderLog({ provider: "fotmob", event: "request_failed" }).map((e) => e.status), [503]);
  assert.equal(getProviderLog({ event: "malformed" }).length, 1);
});

test("http helper times out and logs it", async () => {
  clearProviderLog();
  const slow = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const out = await fetchJson("https://x.test/slow", { provider: "fotmob", fetchImpl: slow, timeoutMs: 10 });
  assert.equal(out.ok, false);
  assert.equal(out.error, "timeout");
  assert.equal(getProviderLog({ event: "timeout" }).length, 1);
});

test("fotmob fixtures are normalised with source and competition", async () => {
  const payload = { fixtures: { allMatches: [{
    id: "5868133",
    status: { utcTime: "2026-11-22T13:00:00.000Z", started: false, finished: false },
    home: { id: "8634", name: "Barcelona" },
    away: { id: "10205", name: "Villarreal" }
  }] } };
  const out = await fotmobFixtures({ date: "2026-11-22", deps: { fetchImpl: async () => json(payload) } });
  assert.equal(out.ok, true);
  assert.equal(out.source, "fotmob");
  assert.equal(out.fixtures.length, 1);
  assert.equal(out.fixtures[0].source, "fotmob");
  assert.equal(out.fixtures[0].home.name, "Barcelona");
  assert.equal(out.fixtures[0].status, "scheduled");
});

test("malformed provider payloads are logged failures, not empty data", async () => {
  clearProviderLog();
  const fm = await fotmobFixtures({ date: "2026-11-22", deps: { fetchImpl: async () => json({ fixtures: {} }) } });
  assert.equal(fm.ok, false);
  assert.match(fm.error, /malformed/);
  assert.equal(getProviderLog({ provider: "fotmob", event: "malformed" }).length, 1);
  const espn = await espnFixtures({ date: "2026-11-22", deps: { fetchImpl: async () => json({}) } });
  assert.equal(espn.ok, false);
  assert.equal(getProviderLog({ provider: "espn", event: "malformed" }).length, 1);
});

test("espn fixtures map status and both sides", async () => {
  const payload = { events: [{ id: "401882804", date: "2026-11-22T13:00Z", competitions: [{
    date: "2026-11-22T13:00Z",
    status: { displayClock: "0'", type: { name: "STATUS_SCHEDULED", state: "pre" } },
    competitors: [
      { homeAway: "home", team: { id: "83", displayName: "Barcelona" }, score: "0" },
      { homeAway: "away", team: { id: "102", displayName: "Villarreal" }, score: "0" }
    ]
  }] }] };
  const out = await espnFixtures({ date: "2026-11-22", deps: { fetchImpl: async () => json(payload) } });
  assert.equal(out.source, "espn");
  assert.equal(out.fixtures[0].home.providerTeamId, "83");
  assert.equal(out.fixtures[0].status, "scheduled");
});

test("espn summary rejects a malformed payload", async () => {
  clearProviderLog();
  const out = await getSummary({ eventId: "1", deps: { fetchImpl: async () => json({ nope: true }) } });
  assert.equal(out.ok, false);
  assert.equal(getProviderLog({ provider: "espn", event: "malformed" }).length, 1);
});

test("fallback activates only when the primary fails, and is logged", async () => {
  clearProviderLog();
  const out = await withFallback({
    provider: "fotmob",
    load: async () => ({ ok: false, source: "fotmob", error: "HTTP 500" }),
    fallbackProvider: "espn",
    fallback: async () => ({ ok: true, source: "espn", fixtures: [] })
  });
  assert.equal(out.ok, true);
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.primaryProvider, "fotmob");
  assert.equal(out.primaryError, "HTTP 500");
  assert.equal(getProviderLog({ event: "fallback" }).length, 1);
});

const fixture = (over = {}) => ({
  source: "fotmob",
  competition: "laliga",
  providerMatchId: "1",
  kickoffUtc: "2026-11-22T13:00:00.000Z",
  status: "scheduled",
  score: { home: 0, away: 0 },
  home: { name: "Barcelona" },
  away: { name: "Villarreal" },
  ...over
});

test("reconcile matches fixtures and records both sources", () => {
  clearProviderLog();
  const { matched, conflicts } = reconcile([fixture()], [fixture({ source: "espn", providerMatchId: "9" })]);
  assert.equal(matched.length, 1);
  assert.deepEqual(matched[0].sources, { primary: "fotmob", secondary: "espn" });
  assert.deepEqual(conflicts, []);
});

test("score and status conflicts are flagged, never overwritten", () => {
  clearProviderLog();
  const { matched, conflicts } = reconcile(
    [fixture()],
    [fixture({ source: "espn", providerMatchId: "9", score: { home: 1, away: 0 }, status: "live" })]
  );
  assert.equal(matched[0].score.home, 0, "primary value kept");
  assert.equal(matched[0].status, "scheduled", "primary status kept");
  assert.deepEqual(conflicts.map((c) => c.type).sort(), ["score_mismatch", "status_mismatch"]);
  assert.equal(getProviderLog({ provider: "reconcile", event: "conflict" }).length, 2);
});

test("kickoff drift is flagged when past tolerance but inside the match window", () => {
  clearProviderLog();
  const { conflicts } = reconcile([fixture()], [fixture({ source: "espn", providerMatchId: "9", kickoffUtc: "2026-11-22T15:00:00.000Z" })]);
  assert.deepEqual(conflicts.map((c) => c.type), ["kickoff_mismatch"]);
  assert.equal(conflicts[0].minutes, 120);
});

test("reconcile reports unmatched and ambiguous fixtures instead of guessing", () => {
  const other = fixture({ source: "espn", providerMatchId: "8", home: { name: "Sevilla" }, away: { name: "Betis" } });
  const one = reconcile([fixture()], [other]);
  assert.equal(one.matched.length, 0);
  assert.equal(one.unmatchedPrimary[0].reason, "no_match");
  assert.equal(one.unmatchedSecondary.length, 1);

  const dup = reconcile(
    [fixture()],
    [fixture({ source: "espn", providerMatchId: "9" }), fixture({ source: "espn", providerMatchId: "10" })]
  );
  assert.equal(dup.matched.length, 0);
  assert.equal(dup.unmatchedPrimary[0].reason, "ambiguous");
});

test("EPL clubs resolve to real slugs; unknown clubs stay unresolved", async () => {
  const { slugFor } = await import("../server/lib/teams.mjs");
  assert.equal(slugFor("Arsenal"), "ars");
  assert.equal(slugFor("Brighton & Hove Albion"), "bha");
  assert.equal(slugFor("Manchester United"), "mun");
  assert.equal(slugFor("Nottingham Forest"), "nfo");
  assert.equal(slugFor("Nonexistent Athletic"), null);
});
