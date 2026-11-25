/* Competition registry (Phase 4A, read-only).

   Adds a competition dimension for the provider layer without touching the
   ledger or the existing La Liga payload. The feature flag is OFF unless
   COMPETITIONS=on, so current behaviour is unchanged by default. */

export const DEFAULT_COMPETITION = "laliga";

export const COMPETITIONS = {
  laliga: {
    id: "laliga",
    name: "La Liga",
    country: "Spain",
    season: "2026/27",
    providers: {
      fotmob: { leagueId: 87, seasonId: "2026/2027", url: "https://www.fotmob.com/leagues/87/laliga" },
      espn: { slug: "esp.1", url: "https://www.espn.com/soccer/esp.1/" }
    }
  },
  epl: {
    id: "epl",
    name: "Premier League",
    country: "England",
    season: "2026/27",
    providers: {
      fotmob: { leagueId: 47, seasonId: "2026/2027", url: "https://www.fotmob.com/leagues/47/premier-league" },
      espn: { slug: "eng.1", url: "https://www.espn.com/soccer/eng.1/" }
    }
  }
};

export function competitionsEnabled(env = process.env) {
  return env.COMPETITIONS === "on";
}

export function listCompetitions() {
  return Object.values(COMPETITIONS).map(({ id, name, country, season }) => ({
    id,
    name,
    country,
    season
  }));
}

export function getCompetition(id = DEFAULT_COMPETITION) {
  const competition = COMPETITIONS[id];
  if (!competition) throw new Error(`unknown competition: ${id}`);
  return competition;
}
