/**
 * Brand colours used for the crest fallback badge and for outcome-adjacent
 * accents. Only reached when a crest asset is missing, so these are a safety
 * net rather than the primary identity.
 */
export const TEAM_COLOURS: Record<string, string> = {
  Almeria: "#E2001A",
  "Athletic Bilbao": "#EE2523",
  "Atletico Madrid": "#CB3524",
  Barcelona: "#A50044",
  Cadiz: "#FFE500",
  "Celta Vigo": "#8AC63F",
  Cordoba: "#007A33",
  "Deportivo Alaves": "#0055A5",
  "Deportivo La Coruna": "#0057B8",
  Eibar: "#005BAA",
  Elche: "#056839",
  Espanyol: "#007FC8",
  Getafe: "#005999",
  Girona: "#CD0528",
  Granada: "#C8102E",
  Hercules: "#005BAA",
  Huesca: "#0B4EA2",
  "Las Palmas": "#FFE400",
  Leganes: "#003DA5",
  Levante: "#B4053B",
  Malaga: "#0047BA",
  Mallorca: "#E20613",
  Osasuna: "#D91A21",
  Oviedo: "#003DA5",
  "Racing Santander": "#00913F",
  "Rayo Vallecano": "#E53027",
  "Real Betis": "#00954C",
  "Real Madrid": "#FEBE10",
  "Real Sociedad": "#0067B1",
  "Real Valladolid": "#921131",
  Sevilla: "#D81920",
  "Sporting Gijon": "#E2001A",
  Valencia: "#E8590C",
  Villarreal: "#FFE01B",
  Zaragoza: "#004B9B",
};

export function teamColour(team: string): string {
  return TEAM_COLOURS[team] ?? "#4A5A50";
}

/** Initials used by the fallback badge. */
export function teamInitials(team: string): string {
  return team
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/** Readable text colour for an arbitrary badge background. */
export function readableInk(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = Number.parseInt(full.slice(0, 2), 16) / 255;
  const g = Number.parseInt(full.slice(2, 4), 16) / 255;
  const b = Number.parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.42 ? "#0A110D" : "#F4F8F4";
}
