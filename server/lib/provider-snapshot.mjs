/* Map provider fixtures into the payload's slug shape (Phase 4A).
   Pure and non-mutating. Unknown teams are reported and excluded — never
   given an invented slug. No network, no file I/O. */

import { slugFor } from "./teams.mjs";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });
const madridDay = (iso) => dayFmt.format(new Date(iso));

export function mapProviderFixtures(raw = [], { competition } = {}) {
  const fixtures = [];
  const skipped = [];
  for (const fixture of raw) {
    const home = slugFor(fixture.home?.name);
    const away = slugFor(fixture.away?.name);
    if (!home) { skipped.push({ team: fixture.home?.name ?? null, reason: "unknown team" }); continue; }
    if (!away) { skipped.push({ team: fixture.away?.name ?? null, reason: "unknown team" }); continue; }
    if (!fixture.kickoffUtc || !Number.isFinite(Date.parse(fixture.kickoffUtc))) {
      skipped.push({ match: fixture.providerMatchId ?? null, reason: "missing or invalid kickoff" });
      continue;
    }
    const hasScore = fixture.score?.home !== null && fixture.score?.home !== undefined;
    fixtures.push({
      id: `p-${competition}-${fixture.providerMatchId}`,
      mw: null,
      day: madridDay(fixture.kickoffUtc),
      date: fixture.kickoffUtc,
      timeTBC: false,
      home,
      away,
      venue: "",
      status: fixture.status === "finished" ? "result" : fixture.status === "live" ? "live" : "upcoming",
      providerStatus: fixture.status,
      source: fixture.source,
      provider: fixture.source,
      providerMatchId: fixture.providerMatchId,
      score: hasScore ? [fixture.score.home, fixture.score.away] : null,
      xg: null,
      p: null
    });
  }
  return { fixtures, skipped };
}
