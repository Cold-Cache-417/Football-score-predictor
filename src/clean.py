"""Clean football-data.co.uk CSVs into one match-level DataFrame.

Columns per match:
    date, season, matchday, home, away, fthg, ftag, result,
    odds_h, odds_d, odds_a, odds_source,
    bw_p_h, bw_p_d, bw_p_a   (de-vigged fair probabilities)

Football-data stores dates in a mix of dd/mm/yy and dd/mm/yyyy and odds
coverage varies by season, so dates are parsed leniently and odds come
from the first available source in a preference list:
    PSC (Pinnacle closing) > PS (Pinnacle opening) > B365C > B365 > Avg
Stats columns of the match itself are dropped: they are only ever used
via rolling features computed from PAST matches.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import SEASON_OVERRIDES, TEAM_ALIASES

RESULT_CODES = {"H": 0, "D": 1, "A": 2}

# Odds source preference, most informative first. PSC* are Pinnacle
# closing odds (confirmed present in the CSVs from season 2012/13),
# PS* are Pinnacle pre-closing. "Avg" is the market average.
ODDS_SOURCES = [
    ("PSC", "Pinnacle closing"),
    ("PS", "Pinnacle opening"),
    ("B365C", "Bet365 closing"),
    ("B365", "Bet365 opening"),
    ("Avg", "Market average"),
]


def parse_date(raw: pd.Series) -> pd.Series:
    """Parse dd/mm/yy and dd/mm/yyyy (and 4-digit variants) with day first."""
    result = pd.to_datetime(raw, format="%d/%m/%Y", errors="coerce")
    fallback = raw.index[result.isna()]
    if len(fallback):
        result.loc[fallback] = pd.to_datetime(
            raw.loc[fallback], format="%d/%m/%y", errors="coerce"
        )
    return pd.to_datetime(result)


def season_from_date(date: pd.Series) -> pd.Series:
    """European season: starts in July (`>= 7`), ends the following June.

    Exceptions are handled via SEASON_OVERRIDES; currently only the
    COVID-19 delayed end of season 2019/20, which stretched into July
    2020 (matches between June and the start of 2020/21 in September).
    """
    start_year = np.where(date.dt.month >= 7, date.dt.year, date.dt.year - 1)
    season = pd.Series(start_year, index=date.index).map(
        lambda y: f"{y}/{(y + 1) % 100:02d}"
    )
    for start, end, corrected in SEASON_OVERRIDES:
        window = (date >= start) & (date <= end)
        season[window] = corrected
    return season


def apply_aliases(names: pd.Series, aliases: dict[str, str]) -> pd.Series:
    return names.map(lambda name: aliases.get(name, name))


def _first_available_odds(df: pd.DataFrame) -> pd.DataFrame:
    """For each match, pick the first odds source with all three quoted."""
    picked = pd.DataFrame(
        index=df.index,
        columns=["odds_h", "odds_d", "odds_a", "odds_source"],
        dtype=object,
    )
    for suffix, label in ODDS_SOURCES:
        cols = [f"{suffix}H", f"{suffix}D", f"{suffix}A"]
        cols = [c for c in cols if c in df.columns]
        if len(cols) < 3:
            continue
        missing = picked["odds_h"].isna()
        complete = df[cols].notna().all(axis=1) & missing
        if not complete.any():
            continue
        picked.loc[complete, "odds_h"] = df[f"{cols[0]}"][complete]
        picked.loc[complete, "odds_d"] = df[f"{cols[1]}"][complete]
        picked.loc[complete, "odds_a"] = df[f"{cols[2]}"][complete]
        picked.loc[complete, "odds_source"] = label
    return picked


def clean_matches(raw: pd.DataFrame) -> pd.DataFrame:
    """Raw concatenated seasons -> tidy per-match DataFrame."""
    df = raw.copy()

    # Keep only real, completed matches
    required = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
    df = df.dropna(subset=[c for c in required if c in df.columns])

    df["date"] = parse_date(df["Date"])
    df = df.dropna(subset=["date"]).sort_values("date", kind="stable").reset_index(drop=True)

    df["season"] = season_from_date(df["date"])
    df["home"] = apply_aliases(df["HomeTeam"].astype(str), TEAM_ALIASES)
    df["away"] = apply_aliases(df["AwayTeam"].astype(str), TEAM_ALIASES)

    df["fthg"] = df["FTHG"].astype(int)
    df["ftag"] = df["FTAG"].astype(int)
    df["result"] = df["FTR"].map(RESULT_CODES)
    df = df.dropna(subset=["result"])
    df["result"] = df["result"].astype(int)

    # Matchday within the season, by date order (close enough for
    # walk-forward splitting; better to use date group rank per season)
    df["matchday"] = df.groupby("season")["date"].rank(method="dense").astype(int)

    odds = _first_available_odds(df)
    df = pd.concat([df, odds], axis=1)

    # Sanity: results must be consistent with the goals
    assert (df["fthg"] > df["ftag"]).equals((df["result"] == 0).astype(bool))

    keep = [
        "date", "season", "matchday", "home", "away",
        "fthg", "ftag", "result",
        "odds_h", "odds_d", "odds_a", "odds_source",
    ]
    return df[keep]


def clean_fixtures(raw: pd.DataFrame, league_code: str) -> pd.DataFrame:
    """Clean an upcoming-fixtures file (no results yet) into tidy rows.

    football-data publishes a global fixtures CSV
    (https://www.football-data.co.uk/fixtures.csv) with upcoming matches
    for every league; rows carry odds quotes but no outcome. These rows
    are what the live/forward predictions are made for — they must never
    pass through clean_matches (which drops rows without a result).
    """
    df = raw.copy()
    if "Div" in df.columns:
        df = df[df["Div"] == league_code].copy()
    df = df.dropna(subset=["Date", "HomeTeam", "AwayTeam"]).copy()
    df["date"] = parse_date(df["Date"])
    df = df.dropna(subset=["date"]).sort_values("date", kind="stable").reset_index(drop=True)
    df["season"] = season_from_date(df["date"])
    df["home"] = apply_aliases(df["HomeTeam"].astype(str), TEAM_ALIASES)
    df["away"] = apply_aliases(df["AwayTeam"].astype(str), TEAM_ALIASES)
    df["fthg"] = np.nan
    df["ftag"] = np.nan
    df["result"] = np.nan
    odds = _first_available_odds(df)
    df = pd.concat([df, odds], axis=1)
    keep = [
        "date", "season", "home", "away",
        "fthg", "ftag", "result",
        "odds_h", "odds_d", "odds_a", "odds_source",
    ]
    return df[keep].reset_index(drop=True)
