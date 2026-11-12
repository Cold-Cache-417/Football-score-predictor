/* Single team registry for the server: one slug per club, plus every
   spelling produced by our three real sources (football-data.co.uk,
   openfootball's schedule and API-Football). */

export const TEAMS = {
  ala: { name: "Alavés", code: "ALA", canonical: "Deportivo Alaves" },
  ath: { name: "Athletic Club", code: "ATH", canonical: "Athletic Bilbao" },
  atm: { name: "Atlético Madrid", code: "ATM", canonical: "Atletico Madrid" },
  bar: { name: "Barcelona", code: "BAR", canonical: "Barcelona" },
  bet: { name: "Real Betis", code: "BET", canonical: "Real Betis" },
  cel: { name: "Celta Vigo", code: "CEL", canonical: "Celta Vigo" },
  dep: { name: "Deportivo La Coruña", code: "DEP", canonical: "Deportivo La Coruna" },
  elc: { name: "Elche", code: "ELC", canonical: "Elche" },
  esp: { name: "Espanyol", code: "ESP", canonical: "Espanyol" },
  get: { name: "Getafe", code: "GET", canonical: "Getafe" },
  lev: { name: "Levante", code: "LEV", canonical: "Levante" },
  mal: { name: "Málaga", code: "MAL", canonical: "Malaga" },
  osa: { name: "Osasuna", code: "OSA", canonical: "Osasuna" },
  rac: { name: "Racing Santander", code: "RAC", canonical: "Racing Santander" },
  ray: { name: "Rayo Vallecano", code: "RAY", canonical: "Rayo Vallecano" },
  rma: { name: "Real Madrid", code: "RMA", canonical: "Real Madrid" },
  rso: { name: "Real Sociedad", code: "RSO", canonical: "Real Sociedad" },
  sev: { name: "Sevilla", code: "SEV", canonical: "Sevilla" },
  val: { name: "Valencia", code: "VAL", canonical: "Valencia" },
  vil: { name: "Villarreal", code: "VIL", canonical: "Villarreal" }
};

const ALIASES = {
  // football-data.co.uk
  alaves: "ala",
  "deportivo alaves": "ala",
  "ath bilbao": "ath",
  "athletic bilbao": "ath",
  "athletic club": "ath",
  "ath madrid": "atm",
  "atletico madrid": "atm",
  "atletico de madrid": "atm",
  "club atletico de madrid": "atm",
  barcelona: "bar",
  "fc barcelona": "bar",
  betis: "bet",
  "real betis": "bet",
  "real betis balompie": "bet",
  celta: "cel",
  "celta vigo": "cel",
  "rc celta de vigo": "cel",
  "la coruna": "dep",
  "deportivo la coruna": "dep",
  "rc deportivo la coruna": "dep",
  "deportivo": "dep",
  elche: "elc",
  "elche cf": "elc",
  espanol: "esp",
  espanyol: "esp",
  "rcd espanyol de barcelona": "esp",
  getafe: "get",
  "getafe cf": "get",
  levante: "lev",
  "levante ud": "lev",
  malaga: "mal",
  "malaga cf": "mal",
  osasuna: "osa",
  "ca osasuna": "osa",
  santander: "rac",
  "racing santander": "rac",
  "real racing club de santander": "rac",
  vallecano: "ray",
  "rayo vallecano": "ray",
  "rayo vallecano de madrid": "ray",
  "real madrid": "rma",
  "real madrid cf": "rma",
  sociedad: "rso",
  "real sociedad": "rso",
  "real sociedad de futbol": "rso",
  sevilla: "sev",
  "sevilla fc": "sev",
  valencia: "val",
  "valencia cf": "val",
  villarreal: "vil",
  "villarreal cf": "vil"
};

/** Lowercase, accent-free, punctuation-free. */
export function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Club slug for any spelling we consume, or null when unknown. */
export function slugFor(name) {
  const key = norm(name);
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  // Fallback: containment against the canonical/display names.
  for (const [slug, team] of Object.entries(TEAMS)) {
    const candidates = [norm(team.name), norm(team.canonical), norm(team.code)];
    if (candidates.some((candidate) => candidate === key)) return slug;
  }
  for (const [slug, team] of Object.entries(TEAMS)) {
    const canonical = norm(team.canonical);
    if (canonical && (key.includes(canonical) || canonical.includes(key))) return slug;
  }
  return null;
}

/** Fallback slug for a provider name we cannot resolve, kept visible rather than dropped. */
export function unknownSlug(name) {
  return `x-${norm(name).replace(/ /g, "-")}`;
}

export function teamName(slug) {
  return TEAMS[slug] ? TEAMS[slug].name : slug;
}
