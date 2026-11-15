#!/usr/bin/env node
/**
 * Refresh the provider fixture snapshot (Phase 4A).
 *
 *   COMPETITIONS=on node scripts/refresh_providers.mjs [--force]
 *
 * Runs in CI only. Fetches FotMob first, cross-checks ESPN, reconciles, maps
 * provider fixtures into the payload's slug shape and writes one file that
 * `server/lib/data.mjs` reads synchronously. No request ever fetches a
 * provider in production, and this script never writes the ledger.
 *
 * Flag off: exits immediately without touching the network or the snapshot.
 */
import fs from "node:fs";
import path from "node:path";

import { competitionsEnabled, getCompetition } from "../server/lib/competitions.mjs";
import { getSeasonFixtures } from "../server/lib/providers/fotmob.mjs";
import { getFixtures as espnFixtures } from "../server/lib/providers/espn.mjs";
import { reconcile } from "../server/lib/reconcile.mjs";
import { mapProviderFixtures } from "../server/lib/provider-snapshot.mjs";
import { allow, createBudget, record } from "../server/lib/provider-budget.mjs";
import { getProviderLog, logProviderEvent } from "../server/lib/providers/log.mjs";
import { ROOT } from "../server/lib/data.mjs";

export const SNAPSHOT_FILE = path.join(ROOT, "data/providers/provider_fixtures.json");
export const DEFAULT_HORIZON_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;

export const PROVIDERS = [
  { id: "fotmob", name: "FotMob", url: "https://www.fotmob.com" },
  { id: "espn", name: "ESPN", url: "https://www.espn.com/soccer/" }
];

/* Wrap fetch so every provider call is budgeted and recorded. A blocked call
   returns a 429-shaped response: adapters log it like any other failure. */
function budgetedFetch(fetchImpl, budget, now, calls) {
  return async (url, init) => {
    const provider = url.includes("fotmob.com") ? "fotmob" : "espn";
    const verdict = allow(budget, now);
    if (!verdict.ok) {
      logProviderEvent({ provider, event: "budget_skipped", detail: { reason: verdict.reason, url } });
      return { ok: false, status: 429, json: async () => ({}) };
    }
    calls.count += 1;
    const response = await fetchImpl(url, init);
    record(budget, now, { ok: Boolean(response?.ok) });
    return response;
  };
}

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/* Pure orchestration: no file I/O, so tests drive it with a fake fetch. */
export async function refreshProviders({
  competitionIds = ["epl"],
  now = Date.now(),
  horizonDays = DEFAULT_HORIZON_DAYS,
  budget = createBudget(),
  fetchImpl = globalThis.fetch,
  previous = {},
  deps = {}
} = {}) {
  const calls = { count: 0 };
  const fetchFor = budgetedFetch(fetchImpl, budget, now, calls);
  const competitions = {};
  const horizonStart = now - 6 * HOUR_MS;
  const horizonEnd = now + horizonDays * 24 * HOUR_MS;

  for (const id of competitionIds) {
    const meta = getCompetition(id);
    const primary = await getSeasonFixtures({ competition: id, deps: { ...deps, fetchImpl: fetchFor } });
    const inHorizon = (fixture) => {
      const at = Date.parse(fixture.kickoffUtc || "");
      return Number.isFinite(at) && at >= horizonStart && at <= horizonEnd;
    };
    const primaryFixtures = primary.ok ? primary.fixtures.filter(inHorizon) : [];
    const secondary = { fixtures: [], calls: 0, failures: 0 };

    if (primary.ok) {
      const days = [...new Set(primaryFixtures.map((f) => f.kickoffUtc.slice(0, 10)))];
      for (const day of days) {
        secondary.calls += 1;
        const got = await espnFixtures({ competition: id, date: day, deps: { ...deps, fetchImpl: fetchFor } });
        if (got.ok) secondary.fixtures.push(...got.fixtures);
        else secondary.failures += 1;
      }
    } else {
      logProviderEvent({
        provider: "fotmob",
        event: "fallback",
        detail: { to: "espn", competition: id, reason: primary.error }
      });
      for (let offset = 0; offset < horizonDays; offset += 1) {
        secondary.calls += 1;
        const got = await espnFixtures({
          competition: id,
          date: dayOf(horizonStart + offset * 24 * HOUR_MS),
          deps: { ...deps, fetchImpl: fetchFor }
        });
        if (got.ok) secondary.fixtures.push(...got.fixtures);
        else secondary.failures += 1;
      }
    }

    /* A per-day fallback loop can return the same event twice; keep one. */
    const uniqueSecondary = new Map();
    for (const fixture of secondary.fixtures) {
      uniqueSecondary.set(`${fixture.source}|${fixture.providerMatchId}`, fixture);
    }
    secondary.fixtures = [...uniqueSecondary.values()];

    const reconciled = reconcile(primary.ok ? primaryFixtures : [], secondary.fixtures);
    const chosen = primary.ok ? primaryFixtures : secondary.fixtures;
    const mapped = mapProviderFixtures(chosen, { competition: id });
    const sources = new Set(chosen.map((fixture) => fixture.source));

    const entry = {
      fetchedAt: new Date(now).toISOString(),
      providers: PROVIDERS.map((provider) => ({
        ...provider,
        role: provider.id === "fotmob"
          ? (primary.ok ? "primary" : "failed")
          : (primary.ok
              ? (secondary.failures ? "cross-check-failed" : "cross-check")
              : (sources.has("espn") ? "fallback" : "failed"))
      })),
      state: {
        fotmob: primary.ok ? "ok" : primary.error,
        espn:
          secondary.calls === 0
            ? "not_called"
            : secondary.failures === 0
              ? "ok"
              : secondary.failures === secondary.calls
                ? "failed"
                : "partial",
        fallbackUsed: !primary.ok && sources.has("espn"),
        stale: false,
        lastError: null,
        lastAttemptAt: new Date(now).toISOString(),
        conflicts: reconciled.conflicts.length
      },
      fixtures: mapped.fixtures,
      skipped: mapped.skipped,
      conflicts: reconciled.conflicts,
      unmatchedSecondary: reconciled.unmatchedSecondary.map((fixture) => ({
        source: fixture.source,
        providerMatchId: fixture.providerMatchId,
        home: fixture.home?.name ?? null,
        away: fixture.away?.name ?? null,
        kickoffUtc: fixture.kickoffUtc ?? null
      }))
    };

    const prior = previous[id] || null;
    if (!mapped.fixtures.length) {
      const survivors = (prior?.fixtures || []).filter((fixture) => {
        const at = Date.parse(fixture.date || "");
        return !Number.isFinite(at) || (at >= horizonStart && at <= horizonEnd);
      });
      if (survivors.length) {
        competitions[id] = {
          ...prior,
          providers: entry.providers,
          fixtures: survivors,
          skipped: mapped.skipped,
          state: {
            ...(prior.state || {}),
            ...entry.state,
            stale: true,
            lastError: primary.error || "no fixtures in provider response"
          }
        };
        continue;
      }
    }
    competitions[id] = entry;
  }

  return {
    snapshot: { updatedAt: new Date(now).toISOString(), competitions },
    calls: calls.count,
    budget
  };
}

export const DEFAULT_TTL_MS = 30 * 60 * 1000;

export function shouldRefresh(previous, now, { ttlMs = DEFAULT_TTL_MS, force = false } = {}) {
  if (force || !previous?.updatedAt) return true;
  const last = Date.parse(previous.updatedAt);
  return !Number.isFinite(last) || now - last >= ttlMs;
}

const VOLATILE = new Set(["updatedAt", "fetchedAt", "lastAttemptAt"]);

export function stableSnapshot(snapshot) {
  const sort = (value) => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value).sort()) {
        if (VOLATILE.has(key)) continue;
        out[key] = sort(value[key]);
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(sort(snapshot));
}

function readPrevious(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeSnapshot(file, snapshot) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(snapshot, null, 1)}\n`);
  fs.renameSync(tmp, file);
}

/* Write only the attempt marker when the snapshot content is unchanged. This
   advances `updatedAt` so the TTL gate can skip the next runs, while
   `stableSnapshot` still sees identical content and the commit step stays
   quiet. A frozen marker is what made the old 10-min TTL refresh on every run.
   The tmp file is always removed, even on failure, so a killed run cannot
   leave a partial snapshot behind. */
export function writeAttemptMarker(file, previous, now) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const stamp = new Date(now).toISOString();
  try {
    /* data.mjs derives staleness from state.lastAttemptAt, so the marker must
       write there too. Writing only a top-level field left a permanent outage
       reporting the last good snapshot as fresh. */
    const cloned = JSON.parse(JSON.stringify(previous || {}));
    cloned.updatedAt = stamp;
    cloned.lastAttemptAt = stamp;
    for (const entry of Object.values(cloned.competitions || {})) {
      if (entry && typeof entry === "object") {
        entry.state = { ...(entry.state || {}), lastAttemptAt: stamp };
      }
    }
    fs.writeFileSync(tmp, `${JSON.stringify(cloned, null, 1)}\n`);
    fs.renameSync(tmp, file);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw new Error("could not write attempt marker");
  }
}

async function main() {
  if (!competitionsEnabled()) {
    console.log("COMPETITIONS is off — provider refresh skipped, snapshot untouched.");
    return 0;
  }
  const now = Date.now();
  const force = process.argv.includes("--force");
  const previous = readPrevious(SNAPSHOT_FILE);
  if (!shouldRefresh(previous, now, { force })) {
    console.log("provider snapshot is fresh — refresh skipped.");
    return 0;
  }

  const { snapshot, calls } = await refreshProviders({
    competitionIds: ["epl"],
    now,
    previous: previous?.competitions || {}
  });

  for (const event of getProviderLog()) {
    if (["request_failed", "timeout", "malformed", "fallback", "budget_skipped"].includes(event.event)) {
      console.log(`provider event: ${JSON.stringify(event)}`);
    }
  }

  /* A failed refresh must never overwrite the last known good. When every
     provider returned nothing, exit 1 and leave the previous file intact. */
  const totalFixtures = Object.values(snapshot.competitions).reduce((sum, entry) => sum + entry.fixtures.length, 0);
  if (!totalFixtures) {
    if (previous) {
      writeAttemptMarker(SNAPSHOT_FILE, previous, now);
      console.log("no fixtures obtained — previous snapshot kept, attempt marker written");
    }
    console.log("provider refresh failed: no fixtures from any provider");
    return 1;
  }

  if (previous && stableSnapshot(previous.competitions) === stableSnapshot(snapshot.competitions)) {
    writeAttemptMarker(SNAPSHOT_FILE, previous, now);
    console.log(`provider snapshot unchanged (${calls} calls) — attempt marker written`);
    return 0;
  }
  writeSnapshot(SNAPSHOT_FILE, snapshot);
  const entries = Object.entries(snapshot.competitions);
  console.log(`provider snapshot written: ${path.relative(ROOT, SNAPSHOT_FILE)} (${calls} calls)`);
  for (const [id, entry] of entries) {
    console.log(`  ${id}: ${entry.fixtures.length} fixtures, ${entry.conflicts.length} conflicts, stale=${entry.state.stale}`);
  }
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`provider refresh failed: ${error.message}`);
    process.exit(1);
  });
}
