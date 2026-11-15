/* ESPN adapter (Phase 4A, read-only). Scoreboard + summary, normalised to the
   same fixture shape as FotMob. Every result names ESPN as its source. */

import { getCompetition } from "../competitions.mjs";
import { fetchJson } from "./http.mjs";
import { logProviderEvent } from "./log.mjs";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

function yyyymmdd(value) {
  const raw = String(value || "").replaceAll("-", "");
  if (!/^\d{8}$/.test(raw)) throw new Error(`invalid date: ${value}`);
  return raw;
}

function statusOf(competition) {
  const name = competition.status?.type?.name || "";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCEL")) return "cancelled";
  if (name.includes("ABANDON")) return "abandoned";
  const state = competition.status?.type?.state;
  if (state === "in") return "live";
  if (state === "post") return "finished";
  return "scheduled";
}

function sideOf(competition, homeAway) {
  const side = (competition.competitors || []).find((c) => c.homeAway === homeAway) || {};
  return {
    name: side.team?.displayName || null,
    providerTeamId: String(side.team?.id ?? ""),
    score: side.score === undefined || side.score === "" ? null : Number(side.score)
  };
}

export async function getFixtures({ competition = "laliga", date, deps = {} } = {}) {
  const meta = getCompetition(competition);
  const url = `${BASE}/${meta.providers.espn.slug}/scoreboard?dates=${yyyymmdd(date)}`;
  const result = await fetchJson(url, { provider: "espn", ...deps });
  if (!result.ok) return { ok: false, source: "espn", competition, error: result.error };

  const events = result.data?.events;
  if (!Array.isArray(events)) {
    logProviderEvent({ provider: "espn", event: "malformed", detail: { url, reason: "events" } });
    return { ok: false, source: "espn", competition, error: "malformed payload" };
  }
  return {
    ok: true,
    source: "espn",
    competition,
    fetchedAt: new Date().toISOString(),
    fixtures: events.map((event) => {
      const game = (event.competitions || [])[0] || {};
      return {
        source: "espn",
        competition,
        providerMatchId: String(event.id),
        providerStatusId: game.status?.type?.name || null,
        kickoffUtc: game.date || event.date || null,
        status: statusOf(game),
        liveMinute: game.status?.displayClock || null,
        home: sideOf(game, "home"),
        away: sideOf(game, "away")
      };
    })
  };
}

export async function getSummary({ eventId, competition = "laliga", deps = {} } = {}) {
  if (!eventId) throw new Error("eventId is required");
  const meta = getCompetition(competition);
  const url = `${BASE}/${meta.providers.espn.slug}/summary?event=${encodeURIComponent(eventId)}`;
  const result = await fetchJson(url, { provider: "espn", ...deps });
  if (!result.ok) return { ok: false, source: "espn", error: result.error };

  const data = result.data;
  if (!data || typeof data !== "object" || !data.header) {
    logProviderEvent({ provider: "espn", event: "malformed", detail: { url, reason: "header" } });
    return { ok: false, source: "espn", error: "malformed payload" };
  }
  const teams = data.boxscore?.teams || [];
  return {
    ok: true,
    source: "espn",
    providerMatchId: String(eventId),
    fetchedAt: new Date().toISOString(),
    hasLineups: Boolean(data.rosters?.length),
    hasStats: teams.some((t) => t.statistics?.length),
    hasCommentary: Boolean(data.commentary?.length),
    keyEventCount: (data.keyEvents || []).length
  };
}
