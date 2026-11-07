"""Project-wide settings. Adding a new league is a config change here."""

BASE_URL = "https://www.football-data.co.uk/mmz4281/{season_code}/{league_code}.csv"

# Canonical names for every distinct spelling observed in the raw SP1
# files (2010/11-2025/26). Values chosen to match common usage so that
# other sources (e.g. Understat) can be joined later.
TEAM_ALIASES = {
    "Alaves": "Deportivo Alaves",
    "Ath Bilbao": "Athletic Bilbao",
    "Ath Madrid": "Atletico Madrid",
    "Betis": "Real Betis",
    "Celta": "Celta Vigo",
    "Espanol": "Espanyol",
    "La Coruna": "Deportivo La Coruna",
    "Santander": "Racing Santander",
    "Sociedad": "Real Sociedad",
    "Sp Gijon": "Sporting Gijon",
    "Vallecano": "Rayo Vallecano",
    "Valladolid": "Real Valladolid",
}

# Date-window corrections applied during season labelling, used for
# unusual calendars. ISO (start, end) strings plus the season label
# those matches belong to.
SEASON_OVERRIDES = [
    ("2020-06-01", "2020-08-31", "2019/20"),  # COVID-19 delayed finish
]

# Leagues to download. season_code format is football-data's YY/YY scheme
# ("2324" = 2023/24; century-adjacent years use 4 digits, e.g. "0001").
LEAGUES = {
    "SP1": {
        "name": "La Liga",
        "country": "Spain",
        "seasons": [
            "1011", "1112", "1213", "1314", "1415", "1516", "1617",
            "1718", "1819", "1920", "2021", "2122", "2223", "2324",
            "2425", "2526",
            "2627",  # current season (2026/27), added in Phase 4.5
        ],
        "pipeline": "src/laliga_pipeline.py",
    }
}
