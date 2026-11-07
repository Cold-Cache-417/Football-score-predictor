"""Download football-data.co.uk CSVs with a local cache.

Files are cached under data/raw/. A file is re-downloaded only if
--refresh is passed or it does not exist yet (current-season files grow
over time, so --refresh-force re-downloads even if the file exists).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import requests

from .config import BASE_URL, LEAGUES

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

HEADERS = {
    # football-data.co.uk serves plain CSV, but be a polite identifiable client
    "User-Agent": "football-score-predictor/0.1 (research project)"
}

FIXTURES_URL = "https://www.football-data.co.uk/fixtures.csv"
FIXTURES_CACHE = RAW_DIR / "fixtures.csv"


def cache_path(league_code: str, season_code: str) -> Path:
    return RAW_DIR / f"{league_code}_{season_code}.csv"


def download_one(league_code: str, season_code: str, refresh: bool = False) -> Path | None:
    """Download a season CSV; return the cache path, or None if unavailable."""
    target = cache_path(league_code, season_code)
    if target.exists() and not refresh:
        return target

    url = BASE_URL.format(season_code=season_code, league_code=league_code)
    response = requests.get(url, headers=HEADERS, timeout=60)
    if response.status_code == 404:
        return None  # season not yet available on the site
    response.raise_for_status()

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.content)
    return target


def load_one(league_code: str, season_code: str, refresh: bool = False) -> pd.DataFrame:
    """Load one cached season, parsing dates as defined in notes.txt."""
    path = download_one(league_code, season_code, refresh)
    if path is None:
        return pd.DataFrame()
    return pd.read_csv(path, low_memory=False)


def load_league(league_code: str, refresh: bool = False) -> pd.DataFrame:
    """Load every configured season for a league (empty frames are dropped)."""
    seasons = LEAGUES[league_code]["seasons"]
    frames = [load_one(league_code, season, refresh) for season in seasons]
    non_empty = [f for f in frames if not f.empty]
    if not non_empty:
        raise RuntimeError(f"No data downloaded for {league_code}")
    return pd.concat(non_empty, ignore_index=True)


def download_fixtures(refresh: bool = False) -> Path | None:
    """Download the global upcoming-fixtures file; cached at data/raw/fixtures.csv."""
    if FIXTURES_CACHE.exists() and not refresh:
        return FIXTURES_CACHE
    response = requests.get(FIXTURES_URL, headers=HEADERS, timeout=60)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    FIXTURES_CACHE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES_CACHE.write_bytes(response.content)
    return FIXTURES_CACHE


def load_fixtures(league_code: str, refresh: bool = False) -> pd.DataFrame:
    """Upcoming fixtures of one league from the cached fixtures file."""
    path = download_fixtures(refresh=refresh)
    if path is None:
        return pd.DataFrame()
    df = pd.read_csv(path, low_memory=False)
    if "Div" in df.columns:
        df = df[df["Div"] == league_code].copy()
    return df
