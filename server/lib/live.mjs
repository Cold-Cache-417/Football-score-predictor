/* API-Football (api-sports.io) integration — server only.

   Free plan: 100 requests/day. It cannot read the 2026/27 season or dates
   older than yesterday, but `fixtures?live=all` and `fixtures?date=...` for
   today +/-1 work. Caching is sized around that budget:
   - live feed: 120s while matches are live, 600s when nothing is live
   - recent-results reconciliation: once per 15 min, and only when a finished
     fixture of ours is still missing a score

   The key never leaves the server. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { norm, slugFor } from "./teams.mjs";

const BASE = "https://v3.football.api-sports.io";
const LA_LIGA = 140;

/* The free plan allows 100 requests/day. Keep a persisted daily budget so no
   burst of traffic can spend it silently, and back off after a 429. */
const DAILY_LIMIT = Number(process.env.PROVIDER_DAILY_LIMIT ?? 100);
const QUOTA_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/raw/provider_quota.json"
);
let cooldownUntil = 0;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readQuota() {
  try {
    const stored = JSON.parse(fs.readFileSync(QUOTA_FILE, "utf8"));
    return stored.day === dayKey() ? stored : { day: dayKey(), count: 0 };
  } catch {
    return { day: dayKey(), count: 0 };
  }
}

function writeQuota(quota) {
  try {
    fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(quota));
  } catch {
    /* the budget is best-effort: a read-only disk must not break the feed */
  }
}

export function quotaStatus() {
  const quota = readQuota();
  return {
    day: quota.day,
    used: quota.count,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - quota.count),
    coolingDownUntil: cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null
  };
}

const LIVE_TTL_MS = 120_000;
const IDLE_TTL_MS = 600_000;
const RESULT_TTL_MS = 900_000;

let apiKey = "";
export function setApiKey(key) {
  apiKey = String(key || "").trim();
}
export function liveConfigured() {
  return apiKey.length > 0;
}

async function call(path, params) {
  if (!liveConfigured()) return { error: "unconfigured" };
  if (cooldownUntil > Date.now()) {
    return { error: `rate limit cooldown until ${new Date(cooldownUntil).toISOString()}` };
  }
  const quota = readQuota();
  if (quota.count >= DAILY_LIMIT) {
    return { error: `daily provider quota exhausted (${quota.count}/${DAILY_LIMIT})` };
  }
  quota.count += 1;
  writeQuota(quota);

  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  let response;
  try {
    response = await fetch(url, {
      headers: { "x-apisports-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store"
    });
  } catch (error) {
    return { error: `unreachable: ${error.message}` };
  }
  if (response.status === 429) {
    cooldownUntil = Date.now() + 15 * 60 * 1000;
    return { error: "rate limit reached" };
  }
  if (!response.ok) return { error: `HTTP ${response.status}` };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { error: "unreadable JSON" };
  }
  const errors = payload.errors || {};
  const detail = Object.entries(errors)
    .filter(([, value]) => value)
    .map(([field, value]) => `${field}: ${value}`)
    .join("; ");
  if (detail) return { error: detail };
  return { fixtures: payload.response || [] };
}

function toLiveMatch(raw) {
  const home = slugFor(raw.teams?.home?.name);
  const away = slugFor(raw.teams?.away?.name);
  if (!home || !away) return null;
  const events = (raw.events || [])
    .map((event) => {
      const type = String(event.type || "").toLowerCase();
      const detail = String(event.detail || "");
      const kind = type === "goal" ? "goal" : type === "card" ? "yellow" : type === "subst" ? "subst" : "shot";
      const side = slugFor(event.team?.name);
      return {
        minute: Number(event.time?.elapsed || 0) + Number(event.time?.extra || 0),
        type: kind,
        team: side || home,
        player: String(event.player?.name || event.player?.id || ""),
        detail
      };
    })
    .filter((event) => event.type !== "shot")
    .sort((a, b) => a.minute - b.minute);

  return {
    fixtureId: raw.fixture?.id ?? null,
    home,
    away,
    date: String(raw.fixture?.date || "").slice(0, 10),
    statusShort: raw.fixture?.status?.short || "",
    statusLong: raw.fixture?.status?.long || "",
    minute: raw.fixture?.status?.elapsed ?? null,
    homeGoals: raw.goals?.home ?? null,
    awayGoals: raw.goals?.away ?? null,
    events
  };
}

let liveCache = null;

/** Last known live feed, without spending a provider request. */
export function peekLive() {
  if (!liveConfigured()) {
    return { state: "unconfigured", updatedAt: null, matches: 0, message: "No FOOTBALL_API_KEY configured." };
  }
  if (!liveCache) {
    return { state: "unknown", updatedAt: null, matches: 0, message: "Not polled yet." };
  }
  return {
    state: liveCache.feed.state,
    updatedAt: liveCache.feed.updatedAt,
    matches: liveCache.feed.matches.length,
    message: liveCache.feed.message ?? null,
    ageSeconds: Math.round((Date.now() - liveCache.at) / 1000)
  };
}

export async function getLiveFeed() {
  if (!liveConfigured()) {
    return { state: "unconfigured", matches: [], updatedAt: null, message: "No FOOTBALL_API_KEY configured." };
  }
  const ttl = liveCache && liveCache.feed.matches.length ? LIVE_TTL_MS : IDLE_TTL_MS;
  if (liveCache && Date.now() - liveCache.at < ttl) {
    return { ...liveCache.feed, cached: true };
  }

  const result = await call("/fixtures", { live: "all", league: LA_LIGA });
  if (result.error) {
    if (liveCache) {
      return { ...liveCache.feed, state: "stale", message: result.error, cached: true };
    }
    return { state: "error", matches: [], updatedAt: null, message: result.error };
  }

  const matches = result.fixtures.map(toLiveMatch).filter(Boolean);
  const feed = { state: "ok", matches, updatedAt: new Date().toISOString(), message: undefined };
  liveCache = { feed, at: Date.now() };
  return feed;
}

/* Recent completed results, for fixtures our results file has not caught up
   with yet. Free plan allows today +/- 1 day only. */
const recentCache = new Map();

export async function getResultsForDate(date) {
  if (!liveConfigured()) return { error: "unconfigured" };
  const cached = recentCache.get(date);
  if (cached && Date.now() - cached.at < RESULT_TTL_MS) return cached.value;

  const result = await call("/fixtures", { date, league: LA_LIGA });
  let value;
  if (result.error) {
    value = { error: result.error, matches: [] };
  } else {
    value = {
      matches: result.fixtures
        .map(toLiveMatch)
        .filter(Boolean)
        .filter((match) => ["FT", "AET", "PEN"].includes(match.statusShort.toUpperCase()))
        .filter((match) => match.homeGoals != null && match.awayGoals != null)
    };
  }
  recentCache.set(date, { value, at: Date.now() });
  return value;
}

/** Provider clock/state for honest UI labels. */
export function providerInfo() {
  return {
    name: "API-Football (api-sports.io)",
    configured: liveConfigured(),
    planNote: "Free plan: live fixtures plus today ±1 day; season-wide results come from football-data.co.uk."
  };
}

export function liveKey(home, away) {
  return `${norm(home)}|${norm(away)}`;
}
