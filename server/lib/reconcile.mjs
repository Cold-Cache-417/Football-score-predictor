/* Provider reconciliation (Phase 4A, read-only). Matches by competition +
   normalised teams + kickoff window. Never overwrites a conflicting value:
   the primary value is kept and every disagreement is reported. */

import { logProviderEvent } from "./providers/log.mjs";

export const MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
const KICKOFF_TOLERANCE_MS = 15 * 60 * 1000;

export function normaliseTeamName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchKey(fixture) {
  const teams = [fixture.home?.name, fixture.away?.name].map(normaliseTeamName).join("|");
  return `${fixture.competition}|${teams}`;
}

function kickoffDelta(a, b) {
  const left = Date.parse(a?.kickoffUtc || "");
  const right = Date.parse(b?.kickoffUtc || "");
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(left - right);
}

function conflictsBetween(primary, secondary, delta) {
  const conflicts = [];
  if (delta === null) conflicts.push({ type: "kickoff_missing", primary: primary.kickoffUtc, secondary: secondary.kickoffUtc });
  else if (delta > KICKOFF_TOLERANCE_MS) conflicts.push({ type: "kickoff_mismatch", minutes: Math.round(delta / 60000), primary: primary.kickoffUtc, secondary: secondary.kickoffUtc });
  if (primary.status !== secondary.status) conflicts.push({ type: "status_mismatch", primary: primary.status, secondary: secondary.status });
  const ps = scoreOf(primary), ss = scoreOf(secondary);
  if (ps && ss && ps.home !== null && ps.away !== null && ss.home !== null && ss.away !== null && (ps.home !== ss.home || ps.away !== ss.away)) {
    conflicts.push({ type: "score_mismatch", primary: ps, secondary: ss });
  }
  return conflicts;
}

export function reconcile(primaryFixtures = [], secondaryFixtures = []) {
  const byKey = new Map();
  for (const fixture of secondaryFixtures) {
    const key = matchKey(fixture);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(fixture);
  }
  const matched = [], conflicts = [], unmatchedPrimary = [], used = new Set();
  for (const primary of primaryFixtures) {
    const key = matchKey(primary);
    const candidates = (byKey.get(key) || []).filter((s) => {
      const delta = kickoffDelta(primary, s);
      return delta !== null && delta <= MATCH_WINDOW_MS;
    });
    if (candidates.length !== 1) {
      unmatchedPrimary.push({ fixture: primary, reason: candidates.length ? "ambiguous" : "no_match" });
      continue;
    }
    const secondary = candidates[0];
    used.add(`${key}|${secondary.providerMatchId}`);
    const found = conflictsBetween(primary, secondary, kickoffDelta(primary, secondary));
    for (const conflict of found) {
      conflicts.push({ ...conflict, key, primaryId: primary.providerMatchId, secondaryId: secondary.providerMatchId });
    }
    matched.push({
      ...primary,
      sources: { primary: primary.source, secondary: secondary.source },
      conflicts: found
    });
  }
  const unmatchedSecondary = secondaryFixtures.filter(
    (s) => !used.has(`${matchKey(s)}|${s.providerMatchId}`)
  );
  for (const conflict of conflicts) {
    logProviderEvent({ provider: "reconcile", event: "conflict", detail: conflict });
  }
  return { matched, conflicts, unmatchedPrimary, unmatchedSecondary };
}

export function scoreOf(fixture) {
  if (fixture?.score && typeof fixture.score === "object") return fixture.score;
  return { home: fixture?.home?.score ?? null, away: fixture?.away?.score ?? null };
}

export async function withFallback({ provider, load, fallbackProvider, fallback }) {
  const first = await load();
  if (first.ok) return { ...first, fallbackUsed: false };
  logProviderEvent({
    provider,
    event: "fallback",
    detail: { to: fallbackProvider, reason: first.error || "unknown" }
  });
  const second = await fallback();
  return {
    ...second,
    fallbackUsed: true,
    primaryProvider: provider,
    primaryError: first.error || "unknown"
  };
}
