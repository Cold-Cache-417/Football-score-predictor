/* Results ingestion and reconciliation.

   Two real, free sources:
   1. football-data.co.uk SP1 season file — authoritative results, xG and
      closing odds. Covers the whole season and is the project's existing
      source of truth.
   2. API-Football — the free plan cannot read the 2026 season or old dates,
      but it can read "today +/- 1 day" and live fixtures. Those two are used
      to close the gap for matches that finished in the last day or two, so a
      completed match never lingers as "upcoming".

   football-data always wins when both have a score: it carries xG and odds,
   and it is the file the prediction pipeline reads. */

import { pyFloat, toCsv } from "./csv.mjs";
import { slugFor } from "./teams.mjs";

export const RESULTS_URL = "https://www.football-data.co.uk/mmz4281/2627/SP1.csv";
export const FIXTURES_URL = "https://www.football-data.co.uk/fixtures.csv";

const UA = "football-score-predictor/0.2 (research project; results refresh)";

export async function httpText(url, timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/csv,application/json,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

export function isoDate(raw) {
  const [day, month, year] = String(raw).trim().split("/");
  if (!day || !month || !year) return null;
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function firstNumber(...values) {
  for (const value of values) {
    const text = String(value == null ? "" : value).trim();
    if (!text) continue;
    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Convert the football-data season CSV into the site's results CSV.
 * This is a faithful port of scripts/export_site_data.py (same columns,
 * same matchweek estimate, same odds preference) so the server can refresh
 * results without a Python runtime.
 */
export function buildSeasonResults(rawCsv, parse) {
  const rows = parse(rawCsv).filter((row) => row.HomeTeam);
  const played = new Map();
  const out = [];

  for (const row of rows) {
    const home = slugFor(row.HomeTeam);
    const away = slugFor(row.AwayTeam);
    if (!home || !away) continue;
    const date = isoDate(row.Date);
    if (!date) continue;

    const mw = Math.max(played.get(home) || 0, played.get(away) || 0) + 1;
    played.set(home, (played.get(home) || 0) + 1);
    played.set(away, (played.get(away) || 0) + 1);

    const oddsH = firstNumber(row.B365CH, row.B365H, row.AvgCH, row.AvgH);
    const oddsD = firstNumber(row.B365CD, row.B365D, row.AvgCD, row.AvgD);
    const oddsA = firstNumber(row.B365CA, row.B365A, row.AvgCA, row.AvgA);

    out.push({
      season: "2026/27",
      date,
      time: (row.Time || "").trim(),
      home: row.HomeTeam.trim(),
      away: row.AwayTeam.trim(),
      home_slug: home,
      away_slug: away,
      fthg: row.FTHG || "",
      ftag: row.FTAG || "",
      hxg: row.HxG || "",
      axg: row.AxG || "",
      odds_h: oddsH == null ? "" : pyFloat(oddsH),
      odds_d: oddsD == null ? "" : pyFloat(oddsD),
      odds_a: oddsA == null ? "" : pyFloat(oddsA),
      mw
    });
  }

  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || "99:99") < (b.time || "99:99") ? -1 : 1;
  });

  return out;
}

export const RESULTS_COLUMNS = [
  "season", "date", "time", "home", "away", "home_slug", "away_slug",
  "fthg", "ftag", "hxg", "axg", "odds_h", "odds_d", "odds_a", "mw"
];

export function resultsToCsv(rows) {
  return toCsv(rows, RESULTS_COLUMNS);
}
