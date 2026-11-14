#!/usr/bin/env node
/**
 * Phase 3 ledger-integrity audit.
 *
 *   node scripts/phase3_ledger.mjs [db-path]
 *
 * Read-only against the real ledger; all mutations run on a throwaway copy.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildPayload } from "../server/lib/data.mjs";
import {
  buildEvaluations,
  ledgerStats,
  listForecasts,
  openLedger,
  recordResult,
  summarise
} from "../server/lib/db.mjs";
import { syncLedger } from "../server/lib/ledger-sync.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB = process.argv[2] || path.join(ROOT, "data/calibra.db");
const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass, detail });
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/* ---- read-only baseline ---- */
const db = openLedger(DB, { readOnly: true });
const stats = ledgerStats(db);
add("forecasts = 260", stats.forecasts === 260, `got ${stats.forecasts}`);
add("results = 119", stats.results === 119, `got ${stats.results}`);

const dupPairs = db.prepare("SELECT COUNT(*) c FROM (SELECT pair_key FROM results GROUP BY pair_key HAVING COUNT(*) > 1)").get().c;
add("no duplicate result pair_key", dupPairs === 0, `${dupPairs} duplicates`);
const dupFixtures = db.prepare("SELECT COUNT(*) c FROM (SELECT fixture_id FROM forecasts GROUP BY fixture_id HAVING COUNT(*) > 1)").get().c;
add("no duplicate forecast fixture_id", dupFixtures === 0, `${dupFixtures} duplicates`);

const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all().map((r) => r.name);
add("immutability triggers present", ["forecasts_no_delete", "forecasts_no_update"].every((t) => triggers.includes(t)), triggers.join(", "));

let updateBlocked = false;
let deleteBlocked = false;

const revisionRows = db.prepare("SELECT COUNT(*) c FROM result_revisions").get().c;
add("result_revisions rows = results", revisionRows === stats.results, `${revisionRows} vs ${stats.results}`);
const badHistory = db.prepare(`
  SELECT COUNT(*) c FROM results r
  WHERE r.revision != (SELECT MAX(revision) FROM result_revisions v WHERE v.pair_key = r.pair_key)
     OR r.revision != (SELECT COUNT(*) FROM result_revisions v WHERE v.pair_key = r.pair_key)
`).get().c;
add("revision history consistent", badHistory === 0, `${badHistory} inconsistent rows`);

const late = db.prepare("SELECT late, COUNT(*) c FROM forecasts GROUP BY late ORDER BY late").all();
add("late flags readable", late.length > 0, late.map((r) => `${r.late}=${r.c}`).join(", "));

const evaluations = buildEvaluations(db, { season: "2026/27" });
add("evaluations = settled", evaluations.length === stats.settled, `${evaluations.length} vs ${stats.settled}`);

/* ---- published JSON reproducible from the DB ---- */
const payload = buildPayload();
const forecasts = listForecasts(db, { season: "2026/27" });
const record = summarise(evaluations);
const VOLATILE = new Set(["generatedAt", "resultsUpdatedAt", "predictionsUpdatedAt", "scheduleUpdatedAt", "live"]);
const stable = (v) => {
  const sort = (x) => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") {
      const out = {};
      for (const k of Object.keys(x).sort()) {
        if (VOLATILE.has(k)) continue;
        out[k] = sort(x[k]);
      }
      return out;
    }
    return x;
  };
  return JSON.stringify(sort(v));
};
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
add("fixtures.json reproducible from DB", stable(payload) === stable(read("web/api/fixtures.json")), "semantic equality");
add(
  "ledger.json reproducible from DB",
  stable({ season: "2026/27", record, forecasts: forecasts.length, settled: evaluations.length, evaluations }) ===
    stable(read("web/api/ledger.json")),
  "semantic equality"
);
db.close();

/* ---- mutation tests on a copy ---- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-phase3-"));
const copy = path.join(dir, "copy.db");
fs.copyFileSync(DB, copy);
const before = hash(copy);
const mut = openLedger(copy);

try {
  mut.prepare("UPDATE forecasts SET home = home WHERE pair_key = (SELECT pair_key FROM forecasts LIMIT 1)").run();
} catch (error) {
  updateBlocked = /immutable/i.test(error.message);
}
try {
  mut.prepare("DELETE FROM forecasts WHERE pair_key = (SELECT pair_key FROM forecasts LIMIT 1)").run();
} catch (error) {
  deleteBlocked = /immutable/i.test(error.message);
}
add("UPDATE forecasts aborts", updateBlocked, "trigger fired");
add("DELETE forecasts aborts", deleteBlocked, "trigger fired");

const target = mut.prepare("SELECT pair_key, home_goals, away_goals, revision FROM results ORDER BY pair_key LIMIT 1").get();
const revised = recordResult(mut, {
  pairKey: target.pair_key,
  fixtureId: mut.prepare("SELECT fixture_id FROM results WHERE pair_key = ?").get(target.pair_key).fixture_id,
  season: "2026/27",
  matchweek: null,
  kickoffUtc: null,
  home: target.pair_key.split("|")[1],
  away: target.pair_key.split("|")[2],
  homeGoals: target.home_goals + 1,
  awayGoals: target.away_goals,
  status: "FT",
  source: "phase3-test"
});
const after = mut.prepare("SELECT home_goals, away_goals, revision FROM results WHERE pair_key = ?").get(target.pair_key);
const history = mut.prepare("SELECT revision, home_goals, away_goals FROM result_revisions WHERE pair_key = ? ORDER BY revision").all(target.pair_key);
add("correction increments revision", revised.status === "corrected" && after.revision === target.revision + 1, `${revised.status} rev ${target.revision}->${after.revision}`);
add("correction preserves history", history.length === target.revision + 1 && history[0].home_goals === target.home_goals, `${history.length} revisions`);
add("new score persisted", after.home_goals === target.home_goals + 1, `${after.home_goals}-${after.away_goals}`);
mut.close();

/* ---- idempotent sync on a clean copy ---- */
const clean = path.join(dir, "clean.db");
fs.copyFileSync(DB, clean);
const cleanBefore = hash(clean);
const syncDb = openLedger(clean);
const summary = syncLedger(syncDb);
syncDb.close();
const cleanAfter = hash(clean);
add("no-op sync is byte-identical", cleanBefore === cleanAfter, `${summary.results.unchanged} unchanged`);
add("no-op sync adds nothing", summary.forecasts.inserted === 0 && summary.results.new === 0 && summary.results.corrected === 0, `inserted ${summary.forecasts.inserted}, new ${summary.results.new}, corrected ${summary.results.corrected}`);

fs.rmSync(dir, { recursive: true, force: true });

const failed = checks.filter((c) => !c.pass);
console.log(`Phase 3 ledger integrity — ${path.relative(ROOT, DB)}`);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}  (${c.detail})`);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
