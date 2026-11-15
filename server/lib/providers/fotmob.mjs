/* FotMob adapter (Phase 4A, read-only). Every result names its source.
   Malformed/unexpected payloads are logged failures, never empty results. */

import { getCompetition } from "../competitions.mjs";
import { fetchJson } from "./http.mjs";
import { logProviderEvent } from "./log.mjs";

const BASE = "https://www.fotmob.com/api/data";

function yyyymmdd(value) {
  const raw = String(value || "").replaceAll("-", "");
  if (!/^\d{8}$/.test(raw)) throw new Error(`invalid date: ${value}`);
  return raw;
}

function statusOf(match) {
  const s = match.status || {};
  if (s.finished) return "finished";
  if (s.cancelled) return "cancelled";
  if (s.started) return "live";
  return "scheduled";
}

function fixtureOf(competition, m) {
  return {
    source: "fotmob",
    competition,
    providerMatchId: String(m.id),
    providerStatusId: m.statusId ?? null,
    kickoffUtc: m.status?.utcTime || null,
    status: statusOf(m),
    liveMinute: m.status?.liveTime?.long || null,
    score: m.home?.score != null
      ? { home: m.home.score, away: m.away?.score ?? null }
      : (() => { const p = String(m.status?.scoreStr || "").split(" - "); return p.length === 2 ? { home: Number(p[0]), away: Number(p[1]) } : { home: null, away: null }; })(),
    home: { name: m.home?.name || null, providerTeamId: String(m.home?.id ?? "") },
    away: { name: m.away?.name || null, providerTeamId: String(m.away?.id ?? "") }
  };
}

async function loadSeason(competition, deps) {
  const meta = getCompetition(competition);
  const { leagueId, seasonId } = meta.providers.fotmob;
  const url = `${BASE}/leagues?id=${leagueId}&season=${encodeURIComponent(seasonId)}`;
  const result = await fetchJson(url, { provider: "fotmob", ...deps });
  if (!result.ok) return { ok: false, source: "fotmob", competition, error: result.error };

  const all = result.data?.fixtures?.allMatches;
  if (!Array.isArray(all)) {
    logProviderEvent({ provider: "fotmob", event: "malformed", detail: { url, reason: "allMatches" } });
    return { ok: false, source: "fotmob", competition, error: "malformed payload" };
  }
  return { ok: true, source: "fotmob", competition, matches: all };
}

export async function getFixtures({ competition = "laliga", date, deps = {} } = {}) {
  const day = yyyymmdd(date);
  const season = await loadSeason(competition, deps);
  if (!season.ok) return season;
  const matches = season.matches.filter((m) => (m.status?.utcTime || "").slice(0, 10) === date);
  return {
    ok: true,
    source: "fotmob",
    competition,
    fetchedAt: new Date().toISOString(),
    fixtures: matches.map((m) => fixtureOf(competition, m))
  };
}

/* Whole season in one call. The refresh job needs a horizon, not one day. */
export async function getSeasonFixtures({ competition = "laliga", deps = {} } = {}) {
  const season = await loadSeason(competition, deps);
  if (!season.ok) return season;
  return {
    ok: true,
    source: "fotmob",
    competition,
    fetchedAt: new Date().toISOString(),
    fixtures: season.matches.map((m) => fixtureOf(competition, m))
  };
}

export async function getMatch({ matchId, deps = {} } = {}) {
  if (!matchId) throw new Error("matchId is required");
  const url = `${BASE}/matchDetails?matchId=${encodeURIComponent(matchId)}`;
  const result = await fetchJson(url, { provider: "fotmob", ...deps });
  if (!result.ok) return { ok: false, source: "fotmob", error: result.error };

  const status = result.data?.header?.status;
  if (!status || !result.data?.content) {
    logProviderEvent({ provider: "fotmob", event: "malformed", detail: { url, reason: "header" } });
    return { ok: false, source: "fotmob", error: "malformed payload" };
  }
  const content = result.data.content;
  return {
    ok: true,
    source: "fotmob",
    providerMatchId: String(matchId),
    fetchedAt: new Date().toISOString(),
    status: status.finished ? "finished" : status.started ? "live" : "scheduled",
    score: status.scoreStr ?? null,
    hasLineups: Boolean(content.lineup?.homeTeam?.starters?.length),
    hasShotmap: Boolean(content.shotmap?.shots?.length),
    hasStats: Boolean(content.stats?.Periods?.All?.stats?.length),
    eventCount: (content.matchFacts?.events?.events || []).length
  };
}
