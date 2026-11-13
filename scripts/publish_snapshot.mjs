#!/usr/bin/env node
/**
 * Publish validated, public-safe exports into web/api/.
 *
 * Reads the ledger read-only, builds the same payload the HTTP server serves,
 * writes it as static JSON, copies the scoreline grids, then asserts every
 * invariant. Exits non-zero on any failure, so a bad snapshot is never committed.
 *
 *   node scripts/publish_snapshot.mjs
 */
import fs from "node:fs";
import path from "node:path";

import { buildPayload, ROOT } from "../server/lib/data.mjs";
import { buildEvaluations, ledgerStats, listForecasts, openLedger, summarise } from "../server/lib/db.mjs";
import { budgetStatus } from "../server/lib/live.mjs";

const SEASON = "2026/27";
const OUT = path.join(ROOT, "web/api");
const GRIDS_IN = path.join(ROOT, "data/website/scorelines");
const GRIDS_OUT = path.join(ROOT, "web/data/website/scorelines");
const DB = path.join(ROOT, "data/calibra.db");

const failures = [];
const fail = (m) => failures.push(m);
const SECRET_RX = /api[_-]?key|secret|bearer|password|passwd|credential|\/Users\/|BEGIN PRIVATE|ssh-rsa/i;

function writeJson(file, value) {
  const body = JSON.stringify(value);
  const hit = body.match(SECRET_RX);
  if (hit) fail(`${path.relative(ROOT, file)}: secret-like token "${hit[0]}"`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return body.length;
}

function copyGrids() {
  if (!fs.existsSync(GRIDS_IN)) {
    /* CI has no parquet source: the committed grids are the published state. */
    const existing = fs.existsSync(GRIDS_OUT)
      ? fs.readdirSync(GRIDS_OUT).filter((f) => f.endsWith(".json")).length
      : 0;
    if (existing === 260) return existing;
    fail(`scorelines missing: ${GRIDS_IN} and only ${existing}/260 committed`);
    return 0;
  }
  const files = fs.readdirSync(GRIDS_IN).filter((f) => f.endsWith(".json"));
  fs.mkdirSync(GRIDS_OUT, { recursive: true });
  for (const f of files) {
    const raw = fs.readFileSync(path.join(GRIDS_IN, f), "utf8");
    const hit = raw.match(SECRET_RX);
    if (hit) fail(`scoreline ${f}: secret-like token "${hit[0]}"`);
    JSON.parse(raw);
    fs.writeFileSync(path.join(GRIDS_OUT, f), raw);
  }
  return files.length;
}
const generatedAt = new Date().toISOString();
const db = openLedger(DB, { readOnly: true });

const payload = buildPayload();
const evaluations = buildEvaluations(db, { season: SEASON });
const forecasts = listForecasts(db, { season: SEASON });
const record = summarise(evaluations);
const stats = ledgerStats(db);

if (forecasts.length !== 260) fail(`forecasts: expected 260, got ${forecasts.length}`);
if (stats.results !== 119) fail(`results: expected 119, got ${stats.results}`);
if (stats.forecasts !== 260) fail(`ledgerStats.forecasts: expected 260, got ${stats.forecasts}`);
if (evaluations.length !== stats.settled) fail(`settled mismatch: ${evaluations.length} vs ${stats.settled}`);

const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all().map((r) => r.name);
for (const t of ["forecasts_no_delete", "forecasts_no_update"]) {
  if (!triggers.includes(t)) fail(`missing trigger: ${t}`);
}

const sizes = {};
sizes["fixtures.json"] = writeJson(path.join(OUT, "fixtures.json"), payload);
sizes["ledger.json"] = writeJson(path.join(OUT, "ledger.json"), {
  season: SEASON,
  generatedAt,
  record,
  forecasts: forecasts.length,
  settled: evaluations.length,
  evaluations
});
const mtime = (p) => {
  try { return fs.statSync(p).mtime.toISOString(); } catch { return null; }
};

sizes["health.json"] = writeJson(path.join(OUT, "health.json"), {
  ok: true,
  generatedAt,
  ledger: stats,
  quota: budgetStatus(),
  data: {
    resultsUpdatedAt: mtime(path.join(ROOT, "data/website/season_results.csv")),
    predictionsUpdatedAt: mtime(path.join(ROOT, "data/website/upcoming_predictions.csv"))
  }
});

sizes["live.json"] = writeJson(path.join(OUT, "live.json"), {
  state: process.env.FOOTBALL_API_KEY ? "idle" : "unconfigured",
  matches: [],
  updatedAt: null,
  message: "Static snapshot. Live polling runs in GitHub Actions."
});

const boot = `/* generated ${generatedAt} from the ledger; public data only */\nwindow.CALIBRA_BOOTSTRAP = ${JSON.stringify(payload)};\n`;
if (SECRET_RX.test(boot)) fail("bootstrap.js: secret-like token");
fs.writeFileSync(path.join(OUT, "bootstrap.js"), boot);
sizes["bootstrap.js"] = boot.length;

const gridCount = copyGrids();
if (gridCount !== 260) fail(`scorelines: expected 260, got ${gridCount}`);
console.log("exports written to web/api/");
for (const [name, bytes] of Object.entries(sizes)) console.log(`  ${name.padEnd(16)} ${bytes} bytes`);
console.log(`  scorelines       ${gridCount} files`);
console.log(`ledger: ${stats.forecasts} forecasts, ${stats.results} results, ${stats.settled} settled, triggers ${triggers.join(", ")}`);

if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK — all assertions passed");

