/* Keeping the ledger in step with the pipeline exports.

   Two independent jobs:
   - forecasts: the export is written by src/export_website.py before kickoff.
     Imported ONCE per fixture. Re-running an export later never rewrites a row.
   - results: the season CSV (football-data.co.uk) plus any stored provider
     reconciliation. Corrections are allowed and audited inside the ledger.

   No network access here: this module only reads files that already exist. */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { parseCsv } from "./csv.mjs";
import { madridToUtcIso, ROOT, FILES } from "./data.mjs";
import { slugFor } from "./teams.mjs";
import { insertForecasts, openLedger, pairKey, recordResult } from "./db.mjs";

export const SEASON = "2026/27";
const SCHEDULE = path.join(ROOT, "data/raw/schedule_2627.json");
const MODELS = path.join(ROOT, "data/website/models");
const PROVIDER_RESULTS = path.join(ROOT, "data/raw/api_results_2627.json");

const num = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Short, stable fingerprint of the fitted models behind an export. */
export function modelVersion() {
  const hash = crypto.createHash("sha256");
  let found = false;
  for (const name of ["dixon_coles.pkl", "catboost_model.cbm"]) {
    try {
      hash.update(fs.readFileSync(path.join(MODELS, name)));
      found = true;
    } catch {
      /* model artefact missing: version stays unknown rather than guessed */
    }
  }
  return found ? hash.digest("hex").slice(0, 12) : null;
}

function scheduleTimes() {
  const times = new Map();
  try {
    const payload = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
    for (const match of payload.matches || []) {
      const home = slugFor(match.home);
      const away = slugFor(match.away);
      if (!home || !away || !match.date) continue;
      times.set(`${match.date}|${home}|${away}`, {
        time: match.time || null,
        matchweek: Number.isFinite(Number(match.matchweek)) ? Number(match.matchweek) : null
      });
    }
  } catch {
    /* no schedule: kickoff stays null and the lateness check is skipped */
  }
  return times;
}

function readFile(file) {
  try {
    const stat = fs.statSync(file);
    return { text: fs.readFileSync(file, "utf8"), mtime: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

export function forecastRows() {
  const file = readFile(FILES.predictions);
  if (!file) return { rows: [], generatedAt: null, type: null };
  const times = scheduleTimes();
  const version = modelVersion();
  const rows = [];
  let type = null;
  for (const row of parseCsv(file.text)) {
    const home = slugFor(row.home);
    const away = slugFor(row.away);
    if (!home || !away || !row.date) continue;
    type = type || row.prediction_type || null;
    const scheduled = times.get(`${row.date}|${home}|${away}`) || null;
    // A TBC kickoff stays unknown: never fabricate midnight.
    const kickoffUtc = scheduled?.time ? madridToUtcIso(row.date, scheduled.time) : null;
    const blend = [num(row.p_blend_h), num(row.p_blend_d), num(row.p_blend_a)];
    if (blend.some((p) => p == null)) continue;
    rows.push({
      pairKey: pairKey(row.season || SEASON, home, away),
      fixtureId: `m-${row.date}-${home}-${away}`,
      season: row.season || SEASON,
      matchweek: scheduled?.matchweek ?? null,
      kickoffUtc,
      kickoffDate: row.date,
      kickoffVerified: Boolean(kickoffUtc),
      home,
      away,
      pBlendH: blend[0],
      pBlendD: blend[1],
      pBlendA: blend[2],
      pDcH: num(row.p_dc_h),
      pDcD: num(row.p_dc_d),
      pDcA: num(row.p_dc_a),
      pCatH: num(row.p_cat_h),
      pCatD: num(row.p_cat_d),
      pCatA: num(row.p_cat_a),
      topHomeGoals: num(row.top_home_goals),
      topAwayGoals: num(row.top_away_goals),
      topProb: num(row.top_prob),
      // The exporter may stamp its own generation time; if it does not, keep the
      // file mtime (a real observation) but mark it unverified rather than pass
      // it off as the moment the forecast was produced.
      generatedAt: row.generated_at || file.mtime,
      generatedAtVerified: Boolean(row.generated_at),
      ingestedAt: new Date().toISOString(),
      modelVersion: version,
      predictionType: row.prediction_type || null,
      late: Boolean(kickoffUtc && Date.parse(row.generated_at || file.mtime) >= Date.parse(kickoffUtc))
    });
  }
  return { rows, generatedAt: file.mtime, type };
}

export function resultRows() {
  const rows = [];
  const results = readFile(FILES.results);
  if (results) {
    for (const row of parseCsv(results.text)) {
      const home = row.home_slug || slugFor(row.home);
      const away = row.away_slug || slugFor(row.away);
      const homeGoals = num(row.fthg);
      const awayGoals = num(row.ftag);
      if (!home || !away || homeGoals == null || awayGoals == null) continue;
      const h = num(row.odds_h);
      const d = num(row.odds_d);
      const a = num(row.odds_a);
      let market = null;
      if (h && d && a) {
        const total = 1 / h + 1 / d + 1 / a;
        market = [1 / h / total, 1 / d / total, 1 / a / total];
      }
      rows.push({
        pairKey: pairKey(row.season || SEASON, home, away),
        fixtureId: `m-${row.date}-${home}-${away}`,
        season: row.season || SEASON,
        matchweek: num(row.mw),
        kickoffUtc: madridToUtcIso(row.date, row.time || "00:00"),
        home,
        away,
        homeGoals,
        awayGoals,
        status: "FT",
        source: "football-data.co.uk",
        marketH: market ? market[0] : null,
        marketD: market ? market[1] : null,
        marketA: market ? market[2] : null
      });
    }
  }

  // Provider reconciliation, if the server managed to persist some.
  const provider = readFile(PROVIDER_RESULTS);
  if (provider) {
    let payload = null;
    try {
      payload = JSON.parse(provider.text);
    } catch {
      payload = null;
    }
    const seen = new Set(rows.map((row) => row.pairKey));
    for (const match of payload?.matches || []) {
      const home = slugFor(match.home);
      const away = slugFor(match.away);
      if (!home || !away || match.homeGoals == null || match.awayGoals == null) continue;
      const key = pairKey(SEASON, home, away);
      if (seen.has(key)) continue;
      rows.push({
        pairKey: key,
        fixtureId: `m-${match.date}-${home}-${away}`,
        season: SEASON,
        matchweek: null,
        kickoffUtc: madridToUtcIso(match.date, match.time || "00:00"),
        home,
        away,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        status: match.statusShort || "FT",
        source: "API-Football",
        marketH: null,
        marketD: null,
        marketA: null
      });
    }
  }
  return rows;
}

/** Run both jobs. Safe to call on every boot and after every results refresh. */
export function syncLedger(db = openLedger(path.join(ROOT, "data/calibra.db"))) {
  const forecasts = forecastRows();
  const results = resultRows();
  const inserted = insertForecasts(db, forecasts.rows);

  let newResults = 0;
  let corrected = 0;
  for (const row of results) {
    const outcome = recordResult(db, row);
    if (outcome.status === "new") newResults += 1;
    else if (outcome.status === "corrected") corrected += 1;
  }

  return {
    forecasts: { exported: forecasts.rows.length, inserted: inserted.inserted, alreadyRecorded: inserted.skipped, generatedAt: forecasts.generatedAt },
    results: { seen: results.length, new: newResults, corrected, unchanged: results.length - newResults - corrected }
  };
}
