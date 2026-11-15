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
import { competitionsEnabled, DEFAULT_COMPETITION, getCompetition, listCompetitions } from "../server/lib/competitions.mjs";

const SEASON = "2026/27";
const OUT = path.join(ROOT, "web/api");
const GRIDS_IN = path.join(ROOT, "data/website/scorelines");
const GRIDS_OUT = path.join(ROOT, "web/data/website/scorelines");
const DB = path.join(ROOT, "data/calibra.db");

const failures = [];
const fail = (m) => failures.push(m);
const warnings = [];
const warn = (m) => warnings.push(m);
const SECRET_RX = /api[_-]?key|secret|bearer|password|passwd|credential|\/Users\/|BEGIN PRIVATE|ssh-rsa/i;

const VOLATILE_KEYS = new Set([
  "generatedAt",
  "resultsUpdatedAt",
  "predictionsUpdatedAt",
  "scheduleUpdatedAt",
  "live"
]);

function stableJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const out = {};
      for (const key of Object.keys(v).sort()) {
        if (VOLATILE_KEYS.has(key)) continue;
        out[key] = sort(v[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

function writeJson(file, value) {
  const body = JSON.stringify(value);
  const hit = body.match(SECRET_RX);
  if (hit) fail(`${path.relative(ROOT, file)}: secret-like token "${hit[0]}"`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  /* Keep the existing bytes when only volatile timestamps differ, so an
     idempotent rerun produces no commit and no deploy. */
  if (fs.existsSync(file)) {
    try {
      const previous = JSON.parse(fs.readFileSync(file, "utf8"));
      if (stableJson(previous) === stableJson(value)) return fs.statSync(file).size;
    } catch { /* fall through and rewrite */ }
  }
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
/* Per-competition pages are generated from fixtures.html so they cannot drift
   from the real template. Every marker must exist, or publish fails. */
function writeCompetitionPage(competition) {
  const source = path.join(ROOT, "web/fixtures.html");
  const target = path.join(ROOT, "web", `${competition.id}.html`);
  let html = fs.readFileSync(source, "utf8");
  const swaps = [
    ["<title>Fixture centre — Calibra</title>", `<title>${competition.name} fixtures — Calibra</title>`],
    [
      'content="Browse real La Liga fixtures by club, matchweek and status. Every row opens a full match centre with outcome probabilities and the model call."',
      `content="Browse ${competition.name} fixtures by club and status, with the source of every fixture and kickoff time. Forecasts are published for La Liga only."`
    ],
    [
      'href="https://calibra-laliga.vercel.app/fixtures.html"',
      `href="https://calibra-laliga.vercel.app/${competition.id}.html"`
    ],
    ['<html lang="en">', `<html lang="en" data-competition="${competition.id}">`],
    ['<script src="/api/bootstrap.js"></script>', `<script src="/api/bootstrap-${competition.id}.js"></script>`],
    ["Real results and pipeline forecasts", "Fixtures from FotMob, cross-checked with ESPN"]
  ];
  for (const [from, to] of swaps) {
    if (!html.includes(from)) {
      fail(`${competition.id}.html: template marker missing: ${from.slice(0, 48)}`);
      continue;
    }
    html = html.replace(from, to);
  }
  html = html.split("La Liga predictions").join(`${competition.name} fixtures`);
  fs.writeFileSync(target, html);
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

if (!fs.existsSync(path.join(OUT, "live.json"))) {
  sizes["live.json"] = writeJson(path.join(OUT, "live.json"), {
    state: "unconfigured",
    matches: [],
    updatedAt: null,
    message: "Static snapshot. Live polling runs in GitHub Actions."
  });
}

const bootPath = path.join(OUT, "bootstrap.js");
let boot;
let previousBoot = null;
try {
  const raw = fs.readFileSync(bootPath, "utf8");
  previousBoot = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
} catch { /* no previous bootstrap */ }
if (previousBoot && stableJson(previousBoot) === stableJson(payload)) {
  boot = fs.readFileSync(bootPath, "utf8");
} else {
  boot = `/* generated ${generatedAt} from the ledger; public data only */\nwindow.CALIBRA_BOOTSTRAP = ${JSON.stringify(payload)};\n`;
  fs.writeFileSync(bootPath, boot);
}
if (SECRET_RX.test(boot)) fail("bootstrap.js: secret-like token");
sizes["bootstrap.js"] = boot.length;

/* Non-default competitions are published best-effort. Every EPL issue is a
   warn(): a provider problem must never stop the La Liga publish, which is
   the only path that can still exit the job. La Liga invariants (ledger
   counts, triggers, secrets, scoreline count) remain fail()s below. */
function disabledCompetition(id, name) {
  return {
    meta: {
      competition: { id, name },
      providers: [],
      providerState: { state: "unavailable", stale: true, conflicts: 0 },
      skipped: [],
      conflicts: []
    },
    error: {
      code: "COMPETITION_DISABLED",
      message: `${name} fixtures are not published. Use /api/fixtures for La Liga.`
    }
  };
}

const flagOn = competitionsEnabled();
const nonDefault = listCompetitions().filter((c) => c.id !== DEFAULT_COMPETITION);

/* Always publish the index so the switcher can decide whether to show. */
/* The switcher is rendered from this index and links to <id>.html, so it must
   only list competitions whose page actually exists. Flag off, or flag on
   with no usable EPL data, publish exactly one competition. */
/* The switcher links to <id>.html, so it must only list competitions
   whose page actually exists. The index is written after the loop so it
   reflects what was published this run. */
for (const competition of nonDefault) {
  const fixturesFile = path.join(OUT, `fixtures-${competition.id}.json`);
  const bootFile = path.join(OUT, `bootstrap-${competition.id}.js`);
  const pageFile = path.join(ROOT, "web", `${competition.id}.html`);

  if (!flagOn) {
    /* The switcher only lists competitions whose page exists, so a disabled
       JSON body is dead weight: nothing links to it. Delete it instead of
       writing it, so a flag-off run cannot leave a stale artefact behind. */
    for (const f of [fixturesFile, bootFile, pageFile]) {
      try { fs.unlinkSync(f); } catch { /* absent already */ }
    }
    continue;
  }

  let extra;
  try {
    extra = buildPayload({ competition: competition.id });
  } catch (error) {
    warn(`${competition.id}: payload failed — ${error.message}; publishing disabled body`);
    writeJson(fixturesFile, disabledCompetition(competition.id, competition.name));
    for (const f of [bootFile, pageFile]) {
      try { fs.unlinkSync(f); } catch { /* absent already */ }
    }
    continue;
  }

  if (!extra.meta.providers.length && extra.fixtures.some((fixture) => fixture.provider)) {
    fail(`${competition.id}: provider fixtures without attribution`);
  }

  const usable = extra.meta.matches.upcoming > 0;
  if (!usable) {
    if (fs.existsSync(fixturesFile)) {
      warn(`  ${competition.id}: no provider fixtures — last good artefact kept`);
    } else {
      warn(`  ${competition.id}: no provider fixtures — publishing disabled body`);
      writeJson(fixturesFile, disabledCompetition(competition.id, competition.name));
    }
    for (const f of [bootFile, pageFile]) {
      try { fs.unlinkSync(f); } catch { /* absent already */ }
    }
    continue;
  }

  sizes[`fixtures-${competition.id}.json`] = writeJson(fixturesFile, extra);
  const bootBody = `/* generated ${generatedAt} from the provider snapshot; public data only */\nwindow.CALIBRA_BOOTSTRAP = ${JSON.stringify(extra)};\n`;
  if (SECRET_RX.test(bootBody)) fail(`bootstrap-${competition.id}.js: secret-like token`);
  fs.writeFileSync(bootFile, bootBody);
  sizes[`bootstrap-${competition.id}.js`] = bootBody.length;
  writeCompetitionPage(competition);
}

const publishedCompetitions = listCompetitions().filter(
  (c) => c.id === DEFAULT_COMPETITION || fs.existsSync(path.join(ROOT, "web", `${c.id}.html`))
);
writeJson(path.join(OUT, "competitions.json"), {
  default: DEFAULT_COMPETITION,
  competitions: publishedCompetitions
});

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
if (warnings.length) {
  console.log("\nWARNINGS:");
  for (const w of warnings) console.log(`  - ${w}`);
}
console.log("\nOK — all assertions passed");

