import { readFileSync, statSync } from "fs";
import path from "path";

/**
 * Reads the exported prediction artefacts. No model code is imported and
 * nothing is recomputed here — every number comes from the CSVs written by
 * `src/export_website.py`.
 *
 * Upcoming fixtures are a frozen snapshot. Kickoff times are published by
 * football-data.co.uk in Spanish local time, so the selection below converts
 * them to an absolute instant (Europe/Madrid) before deciding whether a
 * fixture has already started.
 */

const TIME_ZONE = "Europe/Madrid";

export type MatchStatus = "scheduled" | "awaiting_result";

export type UpcomingMatch = {
  season: string;
  date: string;
  home: string;
  away: string;
  /** Blend (65% Dixon-Coles + 35% CatBoost), ordered [home, draw, away]. */
  blend: [number, number, number];
  /** Dixon-Coles alone, ordered [home, draw, away]. */
  dc: [number, number, number];
  /** CatBoost alone, ordered [home, draw, away]. */
  cat: [number, number, number];
  homeGoals: number;
  awayGoals: number;
  scoreProb: number;
  kickoffUtc: string;
  kickoffDateLabel: string;
  kickoffTimeLabel: string;
  kickoffZoneLabel: string;
  status: MatchStatus;
};

export type HeroState = {
  match: UpcomingMatch | null;
  /** When the exported snapshot was written, in plain language. */
  snapshotLabel: string;
  totalUpcoming: number;
  reason: "ok" | "no_file" | "no_unplayed_fixtures";
};

/* ------------------------------------------------------------------ paths */

function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    try {
      statSync(path.join(dir, "data", "website", "upcoming_predictions.csv"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

const ROOT = findProjectRoot();
const PREDICTIONS = path.join(ROOT, "data", "website", "upcoming_predictions.csv");
const RAW_FIXTURES = path.join(ROOT, "data", "raw", "fixtures.csv");

/* -------------------------------------------------------------------- csv */

/** Minimal RFC4180-ish parser: enough for the artefacts we consume. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((cells) => {
    const out: Record<string, string> = {};
    header.forEach((h, i) => {
      out[h] = (cells[i] ?? "").trim();
    });
    return out;
  });
}

function num(value: string | undefined): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------ team aliases */

/** Mirrors TEAM_ALIASES in src/config.py so raw fixture names join cleanly. */
const ALIASES: Record<string, string> = {
  Alaves: "Deportivo Alaves",
  "Ath Bilbao": "Athletic Bilbao",
  "Ath Madrid": "Atletico Madrid",
  Betis: "Real Betis",
  Celta: "Celta Vigo",
  Espanol: "Espanyol",
  "La Coruna": "Deportivo La Coruna",
  Santander: "Racing Santander",
  Sociedad: "Real Sociedad",
  "Sp Gijon": "Sporting Gijon",
  Vallecano: "Rayo Vallecano",
  Valladolid: "Real Valladolid",
};

const aliased = (name: string) => ALIASES[name] ?? name;

/* ------------------------------------------------------------------ time */

function offsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    hour,
    Number(get("minute")),
    Number(get("second")),
  );
  return (asUtc - utcMs) / 60000;
}

/** Wall-clock time in Europe/Madrid -> absolute instant. */
function madridToUtc(year: number, month: number, day: number, hours: number, minutes: number): Date {
  const naive = Date.UTC(year, month - 1, day, hours, minutes);
  let guess = naive - offsetMinutes(naive) * 60000;
  guess = naive - offsetMinutes(guess) * 60000; // second pass settles DST edges
  return new Date(guess);
}

function zoneLabel(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    timeZoneName: "short",
  }).formatToParts(instant);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? TIME_ZONE;
}

function dateLabel(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
}

function timeLabel(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

function snapshotLabelFor(filePath: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(statSync(filePath).mtime);
  } catch {
    return "unknown";
  }
}

/* ------------------------------------------------------------------ join */

/** Kickoff wall-clock times keyed by `date|home|away`, read from the raw feed. */
function kickoffTimes(): Map<string, { hours: number; minutes: number }> {
  const times = new Map<string, { hours: number; minutes: number }>();
  let raw: string;
  try {
    raw = readFileSync(RAW_FIXTURES, "utf8");
  } catch {
    return times;
  }

  for (const row of parseCsv(raw)) {
    if (row.Div !== "SP1") continue;
    const [dd, mm, yyyy] = (row.Date ?? "").split("/");
    const [hh, min] = (row.Time ?? "").split(":");
    if (!dd || !mm || !yyyy || hh === undefined) continue;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const key = `${iso}|${aliased(row.HomeTeam ?? "")}|${aliased(row.AwayTeam ?? "")}`;
    times.set(key, { hours: Number(hh), minutes: Number(min ?? 0) });
  }
  return times;
}

/* ------------------------------------------------------------------ public */

function readRows(): Record<string, string>[] {
  try {
    return parseCsv(readFileSync(PREDICTIONS, "utf8"));
  } catch {
    return [];
  }
}

export function getHeroState(now: Date = new Date()): HeroState {
  const rows = readRows();
  const snapshotLabel = snapshotLabelFor(PREDICTIONS);

  const upcoming = rows
    .filter((r) => r.prediction_type === "live_forward")
    .filter((r) => num(r.p_blend_h) > 0 && num(r.p_blend_d) > 0 && num(r.p_blend_a) > 0);

  if (!upcoming.length) {
    return { match: null, snapshotLabel, totalUpcoming: 0, reason: rows.length ? "no_unplayed_fixtures" : "no_file" };
  }

  const times = kickoffTimes();

  const parsed: UpcomingMatch[] = upcoming.map((r) => {
    const [y, m, d] = r.date.split("-").map(Number);
    const clock = times.get(`${r.date}|${r.home}|${r.away}`);
    // No published time -> treat the whole day as pending until it has passed.
    const hours = clock?.hours ?? 0;
    const minutes = clock?.minutes ?? 0;
    const kickoff = clock ? madridToUtc(y, m, d, hours, minutes) : madridToUtc(y, m, d, 23, 59);

    return {
      season: r.season,
      date: r.date,
      home: r.home,
      away: r.away,
      blend: [num(r.p_blend_h), num(r.p_blend_d), num(r.p_blend_a)],
      dc: [num(r.p_dc_h), num(r.p_dc_d), num(r.p_dc_a)],
      cat: [num(r.p_cat_h), num(r.p_cat_d), num(r.p_cat_a)],
      homeGoals: num(r.top_home_goals),
      awayGoals: num(r.top_away_goals),
      scoreProb: num(r.top_prob),
      kickoffUtc: kickoff.toISOString(),
      kickoffDateLabel: dateLabel(kickoff),
      kickoffTimeLabel: clock ? timeLabel(kickoff) : "time TBC",
      kickoffZoneLabel: clock ? zoneLabel(kickoff) : "",
      status: kickoff.getTime() > now.getTime() ? "scheduled" : "awaiting_result",
    };
  });

  parsed.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  // Only a fixture that has not started may be presented as the next match.
  const next = parsed.find((m) => m.status === "scheduled") ?? null;

  return {
    match: next,
    snapshotLabel,
    totalUpcoming: parsed.length,
    reason: next ? "ok" : "no_unplayed_fixtures",
  };
}
