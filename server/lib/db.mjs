/* The prediction ledger.

   A forecast is written once, before kickoff, and can never be changed: the
   `forecasts` table has an UPDATE/DELETE trigger that aborts. Results are a
   separate table that may be corrected, and every correction is appended to
   `result_revisions`, so a score that changes upstream leaves an audit trail.

   Everything here is plain Node: `node:sqlite` is built in, so the project
   keeps its zero-dependency promise. */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS forecasts (
  pair_key       TEXT PRIMARY KEY,   -- season|home|away, survives a rescheduled date
  fixture_id     TEXT NOT NULL,
  season         TEXT NOT NULL,
  matchweek      INTEGER,
  kickoff_utc    TEXT,
  home           TEXT NOT NULL,
  away           TEXT NOT NULL,
  p_blend_h      REAL NOT NULL,
  p_blend_d      REAL NOT NULL,
  p_blend_a      REAL NOT NULL,
  p_dc_h         REAL,
  p_dc_d         REAL,
  p_dc_a         REAL,
  p_cat_h        REAL,
  p_cat_d        REAL,
  p_cat_a        REAL,
  top_home_goals INTEGER,
  top_away_goals INTEGER,
  top_prob       REAL,
  generated_at   TEXT NOT NULL,
  model_version  TEXT,
  prediction_type TEXT,
  late           INTEGER NOT NULL DEFAULT 0,  -- 1 = generated at/after kickoff, excluded from metrics
  ingested_at    TEXT,                        -- when this ledger imported the row (not when it was predicted)
  generated_at_verified INTEGER NOT NULL DEFAULT 0,  -- 1 = real pipeline timestamp; 0 = unknown, stored as file mtime
  kickoff_verified INTEGER NOT NULL DEFAULT 0,       -- 1 = real kickoff time; 0 = TBC
  kickoff_date   TEXT                                -- fixture date, kept even when the time is unknown
);

CREATE TRIGGER IF NOT EXISTS forecasts_no_update
BEFORE UPDATE ON forecasts
BEGIN
  SELECT RAISE(ABORT, 'forecasts are immutable');
END;

CREATE TRIGGER IF NOT EXISTS forecasts_no_delete
BEFORE DELETE ON forecasts
BEGIN
  SELECT RAISE(ABORT, 'forecasts are immutable');
END;

CREATE TABLE IF NOT EXISTS results (
  pair_key      TEXT PRIMARY KEY,
  fixture_id    TEXT NOT NULL,
  season        TEXT NOT NULL,
  matchweek     INTEGER,
  kickoff_utc   TEXT,
  home          TEXT NOT NULL,
  away          TEXT NOT NULL,
  home_goals    INTEGER NOT NULL,
  away_goals    INTEGER NOT NULL,
  status        TEXT NOT NULL,             -- FT | AET | PEN
  source        TEXT NOT NULL,
  market_p_h    REAL,
  market_p_d    REAL,
  market_p_a    REAL,
  first_seen_at TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  revision      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS result_revisions (
  pair_key    TEXT NOT NULL,
  revision    INTEGER NOT NULL,
  home_goals  INTEGER NOT NULL,
  away_goals  INTEGER NOT NULL,
  source      TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (pair_key, revision)
);

CREATE INDEX IF NOT EXISTS forecasts_season ON forecasts (season);
CREATE INDEX IF NOT EXISTS results_season ON results (season);
`;

export function openLedger(file, { readOnly = false } = {}) {
  if (!readOnly) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { readOnly });
  if (!readOnly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA);
    migrateForecastColumns(db);
  }
  return db;
}

/* Columns added after the first 260 forecasts were written. Adding a nullable
   column never touches a stored row, so the immutability triggers stay intact. */
const FORECAST_COLUMNS = [
  ["ingested_at", "TEXT"],
  ["generated_at_verified", "INTEGER NOT NULL DEFAULT 0"],
  ["kickoff_verified", "INTEGER NOT NULL DEFAULT 0"],
  ["kickoff_date", "TEXT"]
];

function migrateForecastColumns(db) {
  const have = new Set(db.prepare("PRAGMA table_info(forecasts)").all().map((column) => column.name));
  for (const [name, type] of FORECAST_COLUMNS) {
    if (!have.has(name)) db.exec(`ALTER TABLE forecasts ADD COLUMN ${name} ${type}`);
  }
}

export function pairKey(season, home, away) {
  return `${season}|${home}|${away}`;
}

/** Cheap counts for health and monitoring: no payload build, no writes. */
export function ledgerStats(db) {
  const one = (sql) => db.prepare(sql).get().n;
  return {
    forecasts: one("SELECT COUNT(*) AS n FROM forecasts"),
    results: one("SELECT COUNT(*) AS n FROM results"),
    settled: one(
      "SELECT COUNT(*) AS n FROM forecasts f JOIN results r ON r.pair_key = f.pair_key"
    )
  };
}

/* ---- writes ------------------------------------------------------------ */

/** Insert forecasts once. A duplicate is ignored, never overwritten. */
export function insertForecasts(db, rows) {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO forecasts (
      pair_key, fixture_id, season, matchweek, kickoff_utc, home, away,
      p_blend_h, p_blend_d, p_blend_a, p_dc_h, p_dc_d, p_dc_a,
      p_cat_h, p_cat_d, p_cat_a, top_home_goals, top_away_goals, top_prob,
      generated_at, model_version, prediction_type, late,
      ingested_at, generated_at_verified, kickoff_verified, kickoff_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = statement.run(
      row.pairKey, row.fixtureId, row.season, row.matchweek ?? null, row.kickoffUtc ?? null,
      row.home, row.away,
      row.pBlendH, row.pBlendD, row.pBlendA, row.pDcH, row.pDcD, row.pDcA,
      row.pCatH, row.pCatD, row.pCatA,
      row.topHomeGoals ?? null, row.topAwayGoals ?? null, row.topProb ?? null,
      row.generatedAt, row.modelVersion ?? null, row.predictionType ?? null, row.late ? 1 : 0,
      row.ingestedAt ?? null, row.generatedAtVerified ? 1 : 0, row.kickoffVerified ? 1 : 0,
      row.kickoffDate ?? null
    );
    if (Number(result.changes) > 0) inserted += 1;
    else skipped += 1;
  }
  return { inserted, skipped };
}

/** Insert or correct a result. Corrections bump the revision and are logged. */
export function recordResult(db, row, now = new Date().toISOString()) {
  const existing = db.prepare("SELECT * FROM results WHERE pair_key = ?").get(row.pairKey);
  if (!existing) {
    db.prepare(`
      INSERT INTO results (
        pair_key, fixture_id, season, matchweek, kickoff_utc, home, away,
        home_goals, away_goals, status, source, market_p_h, market_p_d, market_p_a,
        first_seen_at, updated_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      row.pairKey, row.fixtureId, row.season, row.matchweek ?? null, row.kickoffUtc ?? null,
      row.home, row.away, row.homeGoals, row.awayGoals, row.status, row.source,
      row.marketH ?? null, row.marketD ?? null, row.marketA ?? null, now, now
    );
    db.prepare(`
      INSERT INTO result_revisions (pair_key, revision, home_goals, away_goals, source, recorded_at)
      VALUES (?, 1, ?, ?, ?, ?)
    `).run(row.pairKey, row.homeGoals, row.awayGoals, row.source, now);
    return { status: "new", revision: 1 };
  }

  const sameScore = existing.home_goals === row.homeGoals && existing.away_goals === row.awayGoals;
  if (sameScore) {
    // Same score: only refresh the source/market if they were missing.
    db.prepare(`
      UPDATE results SET updated_at = ?,
        market_p_h = COALESCE(market_p_h, ?), market_p_d = COALESCE(market_p_d, ?),
        market_p_a = COALESCE(market_p_a, ?), source = ?
      WHERE pair_key = ?
    `).run(now, row.marketH ?? null, row.marketD ?? null, row.marketA ?? null, row.source, row.pairKey);
    return { status: "unchanged", revision: existing.revision };
  }

  const revision = existing.revision + 1;
  db.prepare(`
    UPDATE results SET home_goals = ?, away_goals = ?, source = ?, updated_at = ?, revision = ?,
      market_p_h = COALESCE(?, market_p_h), market_p_d = COALESCE(?, market_p_d),
      market_p_a = COALESCE(?, market_p_a)
    WHERE pair_key = ?
  `).run(
    row.homeGoals, row.awayGoals, row.source, now, revision,
    row.marketH ?? null, row.marketD ?? null, row.marketA ?? null, row.pairKey
  );
  db.prepare(`
    INSERT INTO result_revisions (pair_key, revision, home_goals, away_goals, source, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.pairKey, revision, row.homeGoals, row.awayGoals, row.source, now);
  return { status: "corrected", revision };
}

/* ---- evaluation -------------------------------------------------------- */

export const OUTCOMES = ["H", "D", "A"];

export function outcomeOf(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 0;
  if (homeGoals < awayGoals) return 2;
  return 1;
}

/** Ranked probability score for ordered H/D/A probabilities. */
export function rps(probabilities, outcome) {
  const [h, d, a] = probabilities;
  const cum = [h, h + d, h + d + a];
  let total = 0;
  for (let k = 0; k < 2; k += 1) {
    const observed = outcome <= k ? 1 : 0;
    total += (cum[k] - observed) ** 2;
  }
  return total / 2;
}

export function logLoss(probabilities, outcome) {
  return -Math.log(Math.max(1e-15, probabilities[outcome]));
}

function mean(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : null;
}

function ece(entries) {
  if (!entries.length) return null;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, hit: 0, sum: 0 }));
  for (const { p, hit } of entries) {
    const bucket = Math.min(9, Math.max(0, Math.floor(p * 10)));
    bins[bucket].n += 1;
    bins[bucket].hit += hit;
    bins[bucket].sum += p;
  }
  const total = entries.length;
  return (
    bins
      .filter((bin) => bin.n > 0)
      .reduce((acc, bin) => acc + (bin.n / total) * Math.abs(bin.hit / bin.n - bin.sum / bin.n), 0) * 100
  );
}

const topOf = (forecast) =>
  forecast.top_home_goals == null || forecast.top_away_goals == null
    ? null
    : { home: forecast.top_home_goals, away: forecast.top_away_goals, p: forecast.top_prob };

/** Every stored forecast, settled or not. */
export function listForecasts(db, { season } = {}) {
  return season
    ? db.prepare("SELECT * FROM forecasts WHERE season = ? ORDER BY kickoff_utc").all(season)
    : db.prepare("SELECT * FROM forecasts ORDER BY kickoff_utc").all();
}

/** Join forecasts to results and score every settled fixture. */
export function buildEvaluations(db, { season } = {}) {
  const forecasts = season
    ? db.prepare("SELECT * FROM forecasts WHERE season = ? ORDER BY kickoff_utc").all(season)
    : db.prepare("SELECT * FROM forecasts ORDER BY kickoff_utc").all();
  const results = new Map(
    (season
      ? db.prepare("SELECT * FROM results WHERE season = ?").all(season)
      : db.prepare("SELECT * FROM results").all()
    ).map((row) => [row.pair_key, row])
  );

  const evaluations = [];
  for (const forecast of forecasts) {
    const result = results.get(forecast.pair_key);
    if (!result) continue;
    const outcome = outcomeOf(result.home_goals, result.away_goals);
    const blend = [forecast.p_blend_h, forecast.p_blend_d, forecast.p_blend_a];
    const dc = [forecast.p_dc_h, forecast.p_dc_d, forecast.p_dc_a];
    const cat = [forecast.p_cat_h, forecast.p_cat_d, forecast.p_cat_a];
    const market =
      result.market_p_h == null ? null : [result.market_p_h, result.market_p_d, result.market_p_a];
    const top = topOf(forecast);
    const predictedOutcome = blend.indexOf(Math.max(...blend));
    const argmax = (probs) => (probs.every((p) => p == null) ? null : probs.indexOf(Math.max(...probs)));

    evaluations.push({
      pairKey: forecast.pair_key,
      fixtureId: forecast.fixture_id,
      matchweek: forecast.matchweek,
      kickoffUtc: forecast.kickoff_utc,
      home: forecast.home,
      away: forecast.away,
      late: Boolean(forecast.late),
      generatedAt: forecast.generated_at,
      modelVersion: forecast.model_version,
      outcome,
      outcomeLabel: OUTCOMES[outcome],
      score: [result.home_goals, result.away_goals],
      probabilities: blend,
      predictedOutcome,
      correct: predictedOutcome === outcome,
      rps: rps(blend, outcome),
      logLoss: logLoss(blend, outcome),
      dcRps: dc.every((p) => p != null) ? rps(dc, outcome) : null,
      catRps: cat.every((p) => p != null) ? rps(cat, outcome) : null,
      dcCorrect: argmax(dc) === outcome,
      catCorrect: argmax(cat) === outcome,
      marketRps: market ? rps(market, outcome) : null,
      marketCorrect: market ? argmax(market) === outcome : null,
      topScoreline: top,
      scorelineHit: top ? top.home === result.home_goals && top.away === result.away_goals : null,
      goalError: top ? Math.abs(top.home - result.home_goals) + Math.abs(top.away - result.away_goals) : null,
      revision: result.revision,
      resultSource: result.source
    });
  }
  return evaluations;
}

/** Season-to-date record, computed only from genuine pre-kickoff forecasts. */
export function summarise(evaluations, { includeLate = false } = {}) {
  const rows = includeLate ? evaluations : evaluations.filter((row) => !row.late);
  if (!rows.length) {
    return { matches: 0, rps: null, logLoss: null, accuracy: null, calibration: null, market: null, byMatchweek: [], scorelines: null };
  }
  const blendCalibration = rows.flatMap((row) =>
    row.probabilities.map((p, index) => ({ p, hit: index === row.outcome ? 1 : 0 }))
  );
  const withMarket = rows.filter((row) => row.marketRps != null);
  const withTop = rows.filter((row) => row.topScoreline);

  return {
    matches: rows.length,
    rps: mean(rows.map((row) => row.rps)),
    logLoss: mean(rows.map((row) => row.logLoss)),
    accuracy: (rows.filter((row) => row.correct).length / rows.length) * 100,
    calibration: ece(blendCalibration),
    market: withMarket.length
      ? {
          matches: withMarket.length,
          rps: mean(withMarket.map((row) => row.marketRps)),
          logLoss: null,
          accuracy: (withMarket.filter((row) => row.marketCorrect).length / withMarket.length) * 100
        }
      : null,
    byModel: {
      dc: {
        matches: rows.filter((row) => row.dcRps != null).length,
        rps: mean(rows.map((row) => row.dcRps)),
        accuracy:
          (rows.filter((row) => row.dcCorrect).length / Math.max(1, rows.filter((row) => row.dcRps != null).length)) * 100
      },
      cat: {
        matches: rows.filter((row) => row.catRps != null).length,
        rps: mean(rows.map((row) => row.catRps)),
        accuracy:
          (rows.filter((row) => row.catCorrect).length / Math.max(1, rows.filter((row) => row.catRps != null).length)) * 100
      }
    },
    scorelines: withTop.length
      ? {
          matches: withTop.length,
          exact: (withTop.filter((row) => row.scorelineHit).length / withTop.length) * 100,
          meanGoalError: mean(withTop.map((row) => row.goalError))
        }
      : null,
    byMatchweek: [...new Set(rows.map((row) => row.matchweek))]
      .filter((mw) => mw != null)
      .sort((a, b) => a - b)
      .map((mw) => {
        const group = rows.filter((row) => row.matchweek === mw);
        return {
          matchweek: mw,
          matches: group.length,
          rps: mean(group.map((row) => row.rps)),
          accuracy: (group.filter((row) => row.correct).length / group.length) * 100
        };
      })
  };
}

export const LEDGER_SCHEMA = SCHEMA;
