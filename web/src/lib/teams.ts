export const TEAM_COLOURS: Record<string, string> = {
  "Almeria": "#0067b1",
  "Athletic Bilbao": "#ee2523",
  "Atletico Madrid": "#ce3524",
  "Barcelona": "#a50044",
  "Celta Vigo": "#8ac63f",
  "Deportivo Alaves": "#00954c",
  "Deportivo La Coruna": "#0057b8",
  "Elche": "#0067b1",
  "Espanyol": "#ee2523",
  "Getafe": "#0038a8",
  "Girona": "#cd0528",
  "Granada": "#be1931",
  "Las Palmas": "#f5a300",
  "Leganes": "#1a1a1a",
  "Levante": "#cc0000",
  "Malaga": "#0047ba",
  "Mallorca": "#ed1c24",
  "Osasuna": "#d52b1e",
  "Oviedo": "#b3261e",
  "Racing Santander": "#ce1126",
  "Rayo Vallecano": "#f7a600",
  "Real Betis": "#00954c",
  "Real Madrid": "#febe10",
  "Real Sociedad": "#0067b1",
  "Real Valladolid": "#c8102e",
  "Sevilla": "#da291c",
  "Valencia": "#ee3524",
  "Villarreal": "#ffe01b",
};

export function teamColour(team: string): string {
  return TEAM_COLOURS[team] ?? "#8ca296";
}
