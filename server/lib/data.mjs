/* Read the pipeline's real exports and shape them into the single payload
   the concept frontend renders. Nothing here invents a number: a value is
   either read from an export, computed from results, or null. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv } from "./csv.mjs";
import { slugFor, TEAMS } from "./teams.mjs";
import { buildEvaluations, listForecasts, openLedger, pairKey, summarise } from "./db.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = {
  results: path.join(ROOT, "data/website/season_results.csv"),
  predictions: path.join(ROOT, "data/website/upcoming_predictions.csv"),
  schedule: path.join(ROOT, "data/raw/schedule_2627.json"),
  providerResults: path.join(ROOT, "data/raw/api_results_2627.json"),
  rawResults: path.join(ROOT, "data/raw/SP1_2627.csv"),
  metrics: path.join(ROOT, "reports/test_metrics_final.csv"),
  perSeason: path.join(ROOT, "reports/per_season_metrics_final.csv"),
  testPredictions: path.join(ROOT, "data/website/test_predictions.csv"),
  // CALIBRA_DB lets tests and previews run against a throwaway ledger copy.
  ledger: process.env.CALIBRA_DB ? path.resolve(process.env.CALIBRA_DB) : path.join(ROOT, "data/calibra.db")
};

const cache = new Map();

function readText(file) {
  try {
    const stat = fs.statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.value;
    const value = { text: fs.readFileSync(file, "utf8"), mtime: stat.mtime.toISOString() };
    cache.set(file, { mtimeMs: stat.mtimeMs, value });
    return value;
  } catch {
    cache.delete(file);
    return null;
  }
}

function readJson(file) {
  const raw = readText(file);
  if (!raw) return null;
  try {
    return { value: JSON.parse(raw.text), mtime: raw.mtime };
  } catch {
    return null;
  }
}

/* ---- timezone ---------------------------------------------------------- */

const madridParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Madrid",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

function madridOffsetMinutes(utcMs) {
  const parts = {};
  for (const part of madridParts.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return (asUtc - utcMs) / 60000;
}

/** football-data publishes Madrid wall-clock times; return the UTC instant. */
export function madridToUtcIso(date, time) {
  const [year, month, day] = String(date).split("-").map(Number);
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  if (!year || !month || !day) return null;
  const guess = Date.UTC(year, month - 1, day, hour || 0, minute || 0);
  let utc = guess - madridOffsetMinutes(guess) * 60000;
  utc = guess - madridOffsetMinutes(utc) * 60000;
  return new Date(utc).toISOString();
}

/* ---- loaders ----------------------------------------------------------- */

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function devig(row) {
  const h = number(row.odds_h);
  const d = number(row.odds_d);
  const a = number(row.odds_a);
  if (!h || !d || !a) return null;
  const total = 1 / h + 1 / d + 1 / a;
  return { h: 1 / h / total, d: 1 / d / total, a: 1 / a / total };
}

function scheduleIndex() {
  const schedule = readJson(FILE.schedule);
  const index = new Map();
  if (!schedule) return { index, mtime: null };
  for (const match of schedule.value.matches || []) {
    const home = slugFor(match.home);
    const away = slugFor(match.away);
    if (!home || !away || !match.date) continue;
    index.set(`${match.date}|${home}|${away}`, {
      round: match.round ?? null,
      matchweek: number(match.matchweek),
      time: match.time || null
    });
  }
  return { index, mtime: schedule.mtime };
}

function resultFixtures() {
  const file = readText(FILE.results);
  if (!file) return { fixtures: [], mtime: null };
  const fixtures = [];
  for (const row of parseCsv(file.text)) {
    const home = row.home_slug || slugFor(row.home);
    const away = row.away_slug || slugFor(row.away);
    if (!home || !away || !TEAMS[home] || !TEAMS[away]) continue;
    const hg = number(row.fthg);
    const ag = number(row.ftag);
    if (hg == null || ag == null) continue;
    fixtures.push({
      id: `m-${row.date}-${home}-${away}`,
      mw: number(row.mw),
      day: row.date,
      date: madridToUtcIso(row.date, row.time),
      timeTBC: !row.time,
      home,
      away,
      venue: "",
      status: "result",
      source: "market",
      score: [hg, ag],
      xg: number(row.hxg) == null || number(row.axg) == null ? null : [number(row.hxg), number(row.axg)],
      p: devig(row),
      resultSource: "football-data.co.uk"
    });
  }
  return { fixtures, mtime: file.mtime };
}

function predictionFixtures(schedule) {
  const file = readText(FILE.predictions);
  if (!file) return { fixtures: [], mtime: null, type: null };
  const fixtures = [];
  let type = null;
  for (const row of parseCsv(file.text)) {
    const home = slugFor(row.home);
    const away = slugFor(row.away);
    if (!home || !away || !TEAMS[home] || !TEAMS[away]) continue;
    type = type || row.prediction_type || null;
    const planned = schedule.index.get(`${row.date}|${home}|${away}`) || null;
    const time = planned && planned.time ? planned.time : null;
    fixtures.push({
      id: `m-${row.date}-${home}-${away}`,
      mw: planned ? planned.matchweek : null,
      day: row.date,
      date: madridToUtcIso(row.date, time || "00:00"),
      timeTBC: !time,
      home,
      away,
      venue: "",
      status: "upcoming",
      source: "model",
      score: null,
      xg: null,
      minute: null,
      p: {
        h: number(row.p_blend_h) ?? 0,
        d: number(row.p_blend_d) ?? 0,
        a: number(row.p_blend_a) ?? 0
      },
      dc: { h: number(row.p_dc_h), d: number(row.p_dc_d), a: number(row.p_dc_a) },
      cat: { h: number(row.p_cat_h), d: number(row.p_cat_d), a: number(row.p_cat_a) },
      top: number(row.top_home_goals) == null
        ? null
        : [{ home: number(row.top_home_goals), away: number(row.top_away_goals), p: number(row.top_prob) }]
    });
  }
  return { fixtures, mtime: file.mtime, type };
}

function providerFixtures(schedule) {
  const stored = readJson(FILE.providerResults);
  if (!stored) return [];
  const fixtures = [];
  for (const match of stored.value.matches || []) {
    const home = slugFor(match.home);
    const away = slugFor(match.away);
    if (!home || !away || !TEAMS[home] || !TEAMS[away]) continue;
    const planned = schedule.index.get(`${match.date}|${home}|${away}`) || null;
    fixtures.push({
      id: `m-${match.date}-${home}-${away}`,
      mw: planned ? planned.matchweek : null,
      day: match.date,
      date: madridToUtcIso(match.date, match.time || "00:00"),
      timeTBC: !match.time,
      home,
      away,
      venue: "",
      status: "result",
      source: "market",
      score: [match.homeGoals, match.awayGoals],
      xg: null,
      p: null,
      resultSource: "API-Football"
    });
  }
  return fixtures;
}

/* ---- derived ----------------------------------------------------------- */

function tableFrom(fixtures) {
  const rows = new Map();
  const form = new Map();
  for (const fixture of [...fixtures].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (!fixture.score) continue;
    const [hg, ag] = fixture.score;
    for (const slug of [fixture.home, fixture.away]) {
      if (!rows.has(slug)) {
        rows.set(slug, { team: slug, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 });
        form.set(slug, []);
      }
    }
    const home = rows.get(fixture.home);
    const away = rows.get(fixture.away);
    home.played += 1;
    away.played += 1;
    home.gf += hg;
    home.ga += ag;
    away.gf += ag;
    away.ga += hg;
    if (hg > ag) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
      form.get(fixture.home).push("W");
      form.get(fixture.away).push("L");
    } else if (hg < ag) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
      form.get(fixture.away).push("W");
      form.get(fixture.home).push("L");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      form.get(fixture.home).push("D");
      form.get(fixture.away).push("D");
    }
  }
  const standings = [...rows.values()];
  standings.forEach((row) => {
    row.gd = row.gf - row.ga;
  });
  standings.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      TEAMS[a.team].name.localeCompare(TEAMS[b.team].name)
  );
  standings.forEach((row, index) => {
    row.pos = index + 1;
  });
  const teamForm = {};
  for (const [slug, letters] of form) teamForm[slug] = letters.slice(-6).join("");
  return { standings, teamForm };
}

function metricsFromLive() {
  const file = readText(FILE.metrics);
  if (!file) return { metrics: null, models: null };
  const rows = parseCsv(file.text);
  const value = (metric, model) => {
    const row = rows.find((item) => item.metric === metric);
    return row ? number(row[model]) : null;
  };
  const models = {
    blend: "Blend (DC + CatBoost)",
    dc: "Dixon-Coles (time decay)",
    cat: "CatBoost (tuned)",
    market: "Bookmaker (de-vigged)"
  };
  const out = {};
  for (const [key, column] of Object.entries(models)) {
    out[key] = {
      rps: value("RPS", column),
      logLoss: value("log_loss", column),
      accuracy: value("accuracy", column)
    };
  }
  return {
    metrics: {
      rps: out.blend.rps,
      marketRps: out.market.rps,
      logLoss: out.blend.logLoss,
      marketLogLoss: out.market.logLoss,
      accuracy: out.blend.accuracy == null ? null : out.blend.accuracy * 100,
      marketAccuracy: out.market.accuracy == null ? null : out.market.accuracy * 100
    },
    models: out
  };
}

function performanceFromPerSeason() {
  const file = readText(FILE.perSeason);
  if (!file) return null;
  const rows = parseCsv(file.text);
  const blend = rows.filter((row) => row.model === "Blend (DC + CatBoost)");
  const market = rows.filter((row) => row.model === "Bookmaker (de-vigged)");
  if (!blend.length || !market.length) return null;
  const marketBySeason = new Map(market.map((row) => [row.season, row]));
  return {
    seasons: blend.map((row) => row.season),
    sampleSize: blend.reduce((total, row) => total + (number(row.n) || 0), 0),
    rps: {
      blend: blend.map((row) => number(row.RPS)),
      market: blend.map((row) => (marketBySeason.get(row.season) ? number(marketBySeason.get(row.season).RPS) : null))
    },
    logloss: {
      blend: blend.map((row) => number(row.log_loss)),
      market: blend.map((row) => (marketBySeason.get(row.season) ? number(marketBySeason.get(row.season).log_loss) : null))
    },
    accuracy: {
      blend: blend.map((row) => (number(row.accuracy) ?? 0) * 100),
      market: blend.map((row) => {
        const match = marketBySeason.get(row.season);
        return match ? (number(match.accuracy) ?? 0) * 100 : null;
      })
    }
  };
}

/** Reliability curve + calibration error for the blend and the market,
    computed from the same held-out rows with the same decile method. */
function calibrationFromTest() {
  const file = readText(FILE.testPredictions);
  if (!file) return { bins: null, ece: null, marketEce: null, rows: 0 };
  const rows = parseCsv(file.text);
  const make = () => Array.from({ length: 10 }, () => ({ count: 0, hits: 0, sum: 0 }));
  const blendBins = make();
  const marketBins = make();
  let total = 0;
  let marketTotal = 0;

  const add = (bins, prob, hit) => {
    const bucket = Math.min(9, Math.max(0, Math.floor(prob * 10)));
    bins[bucket].count += 1;
    bins[bucket].hits += hit;
    bins[bucket].sum += prob;
  };

  for (const row of rows) {
    const result = number(row.result);
    if (result == null) continue;
    const blend = [number(row.blend_p_h), number(row.blend_p_d), number(row.blend_p_a)];
    const market = [number(row.book_p_h), number(row.book_p_d), number(row.book_p_a)];
    blend.forEach((prob, index) => {
      if (prob == null) return;
      add(blendBins, prob, index === result ? 1 : 0);
      total += 1;
    });
    market.forEach((prob, index) => {
      if (prob == null) return;
      add(marketBins, prob, index === result ? 1 : 0);
      marketTotal += 1;
    });
  }
  if (!total) return { bins: null, ece: null, marketEce: null, rows: 0 };

  const curve = blendBins
    .filter((bin) => bin.count > 0)
    .map((bin) => ({ predicted: bin.sum / bin.count, observed: bin.hits / bin.count, count: bin.count }));
  const ece = (bins, n) =>
    n
      ? bins
          .filter((bin) => bin.count > 0)
          .reduce((acc, bin) => acc + (bin.count / n) * Math.abs(bin.hits / bin.count - bin.sum / bin.count), 0) * 100
      : null;

  return {
    bins: curve,
    ece: ece(blendBins, total),
    marketEce: ece(marketBins, marketTotal),
    rows: rows.length
  };
}

/* ---- payload ----------------------------------------------------------- */

/** The prediction ledger, if it has been created. Never throws. */
let ledgerDb = null;
function ledger() {
  if (ledgerDb) return ledgerDb;
  try {
    ledgerDb = openLedger(FILE.ledger);
  } catch {
    ledgerDb = null;
  }
  return ledgerDb;
}

function ledgerState() {
  const db = ledger();
  if (!db) return { forecasts: new Map(), evaluations: [], record: null };
  try {
    const forecasts = new Map(listForecasts(db, { season: "2026/27" }).map((row) => [row.pair_key, row]));
    const evaluations = buildEvaluations(db, { season: "2026/27" });
    return { forecasts, evaluations, record: summarise(evaluations) };
  } catch {
    return { forecasts: new Map(), evaluations: [], record: null };
  }
}

export function buildPayload({ liveFeed = null, recentResults = [] } = {}) {
  const schedule = scheduleIndex();
  const results = resultFixtures();
  const predictions = predictionFixtures(schedule);
  const provider = providerFixtures(schedule);

  const byId = new Map(results.fixtures.map((fixture) => [fixture.id, fixture]));
  for (const fixture of provider) {
    if (!byId.has(fixture.id)) byId.set(fixture.id, fixture);
  }
  for (const match of recentResults) {
    const id = `m-${match.date}-${match.home}-${match.away}`;
    if (byId.has(id)) continue;
    const planned = schedule.index.get(`${match.date}|${match.home}|${match.away}`) || null;
    byId.set(id, {
      id,
      mw: planned ? planned.matchweek : null,
      day: match.date,
      date: madridToUtcIso(match.date, match.time || "00:00"),
      timeTBC: true,
      home: match.home,
      away: match.away,
      venue: "",
      status: "result",
      source: "market",
      score: [match.homeGoals, match.awayGoals],
      xg: null,
      p: null,
      resultSource: "API-Football"
    });
  }

  const settled = [...byId.values()];
  const playedIds = new Set(settled.map((fixture) => fixture.id));
  const upcoming = predictions.fixtures.filter((fixture) => !playedIds.has(fixture.id));

  // A forecast whose kickoff has passed but has no result yet is not
  // "upcoming" any more — label it honestly instead of pretending.
  const now = Date.now();
  for (const fixture of upcoming) {
    if (fixture.date && new Date(fixture.date).getTime() < now) fixture.awaitingResult = true;
  }

  const liveByPair = new Map();
  if (liveFeed && liveFeed.state === "ok") {
    for (const match of liveFeed.matches) liveByPair.set(`${match.home}|${match.away}`, match);
  }
  for (const fixture of [...settled, ...upcoming]) {
    const live = liveByPair.get(`${fixture.home}|${fixture.away}`);
    if (!live) continue;
    fixture.status = "live";
    fixture.minute = live.minute;
    fixture.score = [live.homeGoals ?? 0, live.awayGoals ?? 0];
    fixture.events = live.events;
    fixture.liveStatus = live.statusShort;
    fixture.provisional = true;
  }

  const { standings, teamForm } = tableFrom(settled);

  // Archived pre-kickoff forecasts, joined by season|home|away so a rescheduled
  // fixture still finds its own prediction.
  const ledgerView = ledgerState();
  const verdictByPair = new Map(ledgerView.evaluations.map((row) => [row.pairKey, row]));
  for (const fixture of [...settled, ...upcoming]) {
    const key = pairKey("2026/27", fixture.home, fixture.away);
    const forecast = ledgerView.forecasts.get(key);
    if (!forecast) continue;
    const verdict = verdictByPair.get(key) || null;
    fixture.archived = {
      p: { h: forecast.p_blend_h, d: forecast.p_blend_d, a: forecast.p_blend_a },
      top:
        forecast.top_home_goals == null
          ? null
          : { home: forecast.top_home_goals, away: forecast.top_away_goals, p: forecast.top_prob },
      generatedAt: forecast.generated_at,
      // Legacy rows store the export's mtime: real, but not the moment the
      // forecast was produced. The flag says which one the value is.
      generatedAtVerified: Boolean(forecast.generated_at_verified),
      ingestedAt: forecast.ingested_at ?? null,
      kickoffVerified: Boolean(forecast.kickoff_verified),
      kickoff: forecast.kickoff_verified ? forecast.kickoff_utc : null,
      matchweek: forecast.matchweek ?? null,
      modelVersion: forecast.model_version,
      late: Boolean(forecast.late),
      settled: Boolean(verdict),
      predictedOutcome: verdict ? verdict.predictedOutcome : null,
      correct: verdict ? verdict.correct : null,
      rps: verdict ? verdict.rps : null,
      logLoss: verdict ? verdict.logLoss : null,
      scorelineHit: verdict ? verdict.scorelineHit : null,
      resultSource: verdict ? verdict.resultSource : null
    };
  }

  const { metrics, models } = metricsFromLive();
  const performance = performanceFromPerSeason();
  const calibration = calibrationFromTest();

  const fixtures = [...settled, ...upcoming].sort((a, b) => {
    const left = a.date || "";
    const right = b.date || "";
    if (left === right) return a.id < b.id ? -1 : 1;
    return left < right ? -1 : 1;
  });

  const resultMws = settled.map((fixture) => fixture.mw).filter(Boolean);
  const upcomingMws = upcoming.map((fixture) => fixture.mw).filter(Boolean);
  const resultsThroughMw = resultMws.length ? Math.max(...resultMws) : null;
  const nextMw = upcomingMws.length ? Math.min(...upcomingMws) : null;

  const warnings = [];
  const awaiting = upcoming.filter((fixture) => fixture.awaitingResult).length;
  if (awaiting) {
    warnings.push(`${awaiting} fixture${awaiting === 1 ? "" : "s"} kicked off without a confirmed result yet.`);
  }
  if (predictions.mtime) {
    const predictionsDate = new Date(predictions.mtime).getTime();
    const resultsDate = results.mtime ? new Date(results.mtime).getTime() : 0;
    if (resultsDate - predictionsDate > 36 * 3600 * 1000) {
      warnings.push("The forecast export is older than the latest results — re-run the pipeline to re-price.");
    }
  }
  if (!predictions.fixtures.length) {
    warnings.push("No upcoming forecasts exported yet.");
  }

  return {
    meta: {
      season: "2026/27",
      league: "La Liga",
      generatedAt: new Date().toISOString(),
      resultsThroughMw,
      nextMw,
      resultsUpdatedAt: results.mtime,
      predictionsUpdatedAt: predictions.mtime,
      predictionsType: predictions.type,
      scheduleUpdatedAt: schedule.mtime,
      live: liveFeed
        ? {
            state: liveFeed.state,
            updatedAt: liveFeed.updatedAt,
            message: liveFeed.message || null,
            matches: liveFeed.matches.length
          }
        : { state: "unavailable", updatedAt: null, message: null, matches: 0 },
      warnings,
      liveRecord: ledgerView.record,
      forecastsRecorded: ledgerView.evaluations.length,
      matches: { settled: settled.length, upcoming: upcoming.length, total: fixtures.length }
    },
    fixtures,
    standings,
    teamForm,
    metrics: metrics
      ? {
          ...metrics,
          matches: calibration.rows || null,
          seasons: performance ? performance.seasons.length : null,
          calibration: calibration.ece,
          marketCalibration: calibration.marketEce
        }
      : null,
    models,
    performance: performance
      ? { ...performance, calibration: calibration.bins || [] }
      : null
  };
}

export const FILES = FILE;
