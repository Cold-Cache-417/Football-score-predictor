#!/usr/bin/env node
/**
 * Data integrity checks for the site payload.
 *
 * Runs the same builder the HTTP server uses (server/lib/data.mjs) and asserts
 * the invariants the UI depends on. No network, no API keys, no writes.
 *
 *   node scripts/check_site_data.mjs
 */
import { buildPayload } from "../server/lib/data.mjs";

const failures = [];
const warnings = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const payload = buildPayload();
const { fixtures, standings, teamForm, metrics, models, performance, meta } = payload;

/* ---- fixtures ---- */
check(Array.isArray(fixtures) && fixtures.length > 0, "fixtures: payload is empty");

const teamIds = new Set(standings.map((row) => row.team));
check(teamIds.size === 20, `standings: expected 20 teams, found ${teamIds.size}`);

const ids = new Set();
const pairings = new Map();
const nextMw = meta.nextMw;

for (const f of fixtures) {
  check(Boolean(f.id), `fixtures: missing id (${f.home} v ${f.away})`);
  check(!ids.has(f.id), `fixtures: duplicate id ${f.id}`);
  ids.add(f.id);

  check(teamIds.has(f.home) && teamIds.has(f.away), `fixtures: unknown team id on ${f.id}`);
  check(f.home !== f.away, `fixtures: team playing itself (${f.id})`);
  check(Boolean(f.date) && !Number.isNaN(Date.parse(f.date)), `fixtures: bad date on ${f.id}`);
  check(Number.isInteger(f.mw) && f.mw >= 1 && f.mw <= 38, `fixtures: bad matchweek on ${f.id}`);

  const key = `${f.day}|${[f.home, f.away].sort().join("|")}`;
  if (pairings.has(key)) warnings.push(`fixtures: same pairing twice on ${key}`);
  pairings.set(key, true);

  if (f.status === "result") {
    check(Array.isArray(f.score) && f.score.every(Number.isInteger), `fixtures: result without score (${f.id})`);
    check(f.mw < nextMw, `fixtures: result inside unplayed matchweeks (${f.id}, mw ${f.mw})`);
  } else if (f.status === "upcoming") {
    check(!Array.isArray(f.score), `fixtures: upcoming with a score (${f.id})`);
    check(f.mw >= nextMw, `fixtures: upcoming before matchweek ${nextMw} (${f.id}, mw ${f.mw})`);
  } else if (f.status === "live") {
    check(Array.isArray(f.score), `fixtures: live without score (${f.id})`);
  } else {
    failures.push(`fixtures: unknown status "${f.status}" (${f.id})`);
  }

  if (f.p) {
    const sum = f.p.h + f.p.d + f.p.a;
    check(Math.abs(sum - 1) < 0.002, `forecast: H/D/A does not sum to 1 (${f.id}, ${sum.toFixed(4)})`);
    check([f.p.h, f.p.d, f.p.a].every((v) => v >= 0 && v <= 1), `forecast: probability out of range (${f.id})`);
    if (f.top) {
      const top = f.top[0];
      check(Boolean(top) && Number.isInteger(top.home) && Number.isInteger(top.away), `forecast: bad top scoreline (${f.id})`);
      check(top && top.p > 0 && top.p <= 1, `forecast: top scoreline outside (0,1] (${f.id})`);
    }
    if (f.status === "upcoming" && !meta.predictionsUpdatedAt) {
      failures.push(`forecast: no generation timestamp in meta for ${f.id}`);
    }
  } else if (f.status === "upcoming") {
    warnings.push(`forecast: upcoming fixture without a forecast (${f.id})`);
  }
}

/* ---- standings ---- */
const sum = (field) => standings.reduce((acc, row) => acc + (row[field] || 0), 0);
const settled = fixtures.filter((f) => f.status === "result").length;
check(standings.length === 20, `standings: expected 20 rows, found ${standings.length}`);
check(sum("played") === settled * 2, `standings: played total ${sum("played")} != ${settled * 2}`);
check(sum("won") === sum("lost"), `standings: wins ${sum("won")} != losses ${sum("lost")}`);
check(sum("drawn") % 2 === 0, `standings: drawn total ${sum("drawn")} is odd`);
check(sum("gf") === sum("ga"), `standings: goals for ${sum("gf")} != against ${sum("ga")}`);
for (let i = 1; i < standings.length; i += 1) {
  check(standings[i].points <= standings[i - 1].points, `standings: not sorted by points at row ${i + 1}`);
  check(standings[i].pos === i + 1, `standings: position field out of order at row ${i + 1}`);
}

/* ---- form ---- */
check(Object.keys(teamForm).length === 20, `form: expected 20 teams, found ${Object.keys(teamForm).length}`);
for (const [team, form] of Object.entries(teamForm)) {
  check(/^[WDL]{0,6}$/.test(form), `form: unexpected value "${form}" for ${team}`);
}

/* ---- metrics, models, calibration ---- */
check(metrics?.rps != null && metrics?.marketRps != null, "metrics: missing RPS or market RPS");
check(metrics?.accuracy != null && metrics?.marketAccuracy != null, "metrics: missing accuracy");
check(metrics?.calibration != null && metrics?.marketCalibration != null, "metrics: missing calibration error");
check(metrics?.matches != null && metrics.matches > 0, "metrics: missing held-out match count");
check(metrics.seasons === performance.seasons.length, "metrics: season count disagrees with the per-season report");
for (const series of ["rps", "logloss", "accuracy"]) {
  for (const [model, values] of Object.entries(performance[series] || {})) {
    check(
      Array.isArray(values) && values.length === performance.seasons.length,
      `performance: ${series}.${model} does not align with the ${performance.seasons.length} seasons`
    );
  }
}

for (const id of ["blend", "dc", "cat", "market"]) {
  check(models?.[id]?.rps != null, `models: ${id} has no RPS`);
}
check(Math.abs(models.blend.rps - metrics.rps) < 1e-9, "models: blend RPS disagrees with headline metrics");

check(
  Array.isArray(performance?.calibration) && performance.calibration.length > 0,
  "calibration: no reliability bins"
);
for (const bin of performance?.calibration || []) {
  check(bin.predicted >= 0 && bin.predicted <= 1, "calibration: predicted outside [0,1]");
  check(bin.observed >= 0 && bin.observed <= 1, "calibration: observed outside [0,1]");
  check(bin.count > 0, "calibration: empty bin");
}

/* ---- ledger ---- */
const upcomingWithArchive = fixtures.filter((f) => f.status === "upcoming" && f.archived);
for (const fixture of fixtures) {
  if (!fixture.archived) continue;
  const p = fixture.archived.p;
  const sum = p.h + p.d + p.a;
  check(Math.abs(sum - 1) < 0.002, `ledger: archived probabilities do not sum to 1 (${fixture.id})`);
  check(Boolean(fixture.archived.generatedAt), `ledger: archived forecast without a timestamp (${fixture.id})`);
  if (fixture.status === "result" && fixture.archived.settled) {
    check(typeof fixture.archived.correct === "boolean", `ledger: settled forecast without a verdict (${fixture.id})`);
  }
}
check(
  upcomingWithArchive.length === fixtures.filter((f) => f.status === "upcoming").length,
  `ledger: ${fixtures.filter((f) => f.status === "upcoming").length - upcomingWithArchive.length} upcoming fixtures have no archived forecast`
);

/* ---- meta ---- */
check(Number.isInteger(meta?.resultsThroughMw) && meta.resultsThroughMw > 0, "meta: resultsThroughMw missing");
check(meta?.matches?.settled === settled, "meta: settled count disagrees with fixtures");
check(meta?.matches?.upcoming === fixtures.filter((f) => f.status === "upcoming").length, "meta: upcoming count disagrees with fixtures");

for (const message of warnings.slice(0, 5)) console.warn("warn:", message);
if (warnings.length > 5) console.warn(`warn: ...and ${warnings.length - 5} more warnings`);

if (failures.length) {
  for (const message of failures.slice(0, 20)) console.error("FAIL:", message);
  if (failures.length > 20) console.error(`FAIL: ...and ${failures.length - 20} more`);
  process.exit(1);
}

console.log(
  `ok: ${fixtures.length} fixtures (${settled} results, ` +
    `${fixtures.filter((f) => f.status === "upcoming").length} upcoming), ` +
    `${standings.length} teams, ${metrics.matches} held-out matches, ` +
    `${warnings.length} warnings`
);
