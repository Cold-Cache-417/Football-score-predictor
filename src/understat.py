"""Optional xG features from understat.com (league season pages).

Understat embeds per-season match data as JSON inside the league page.
Structure verified by fetching the page (currently the site answers
"We will come back soon", i.e. is down; the fetcher fails soft and the
pipeline simply runs without xG columns until it returns).

The resulting table maps football-data team names via TEAM_ALIASES plus
the UNDERSTAT_ALIASES below (Understat uses different spellings, checked
live once the site is back).

Usage:
    .venv/bin/python -m src.understat           # fetch & cache
    flags --refresh like the football-data downloader
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

import pandas as pd
import requests

from .config import LEAGUES, TEAM_ALIASES

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

# Understat league slug for La Liga (verified: understat.com/league/La_liga)
UNDERSTAT_LEAGUE = "La_liga"

# Understat -> canonical (football-data) team names. Complete this from
# an actual page fetch before enabling the xG features.
UNDERSTAT_ALIASES: dict[str, str] = {"Athletic Club": "Athletic Bilbao"}

HEADERS = {"User-Agent": "Mozilla/5.0 (football-score-predictor research)"}


def fetch_season(season_start_year: int) -> pd.DataFrame | None:
    """One season of matches with xG. None if the site is unavailable."""
    url = f"https://understat.com/league/{UNDERSTAT_LEAGUE}/{season_start_year}"
    r = requests.get(url, timeout=60, headers=HEADERS)
    if r.status_code != 200 or "We will come back soon" in r.text:
        return None
    match = re.search(r"datesData\s*=\s*JSON\.parse\('(.+?)'\)", r.text)
    if not match:
        return None
    data = json.loads(html.unescape(match.group(1)))
    rows = []
    for m in data:
        rows.append({
            "date": pd.to_datetime(m.get("datetime", m["datetime"])).normalize(),
            "understat_home": m["h"]["title"],
            "understat_away": m["a"]["title"],
            "xgf_home": float(m["h"]["xG"]),
            "xga_home": float(m["h"]["xGA"]),
            "xgf_away": float(m["a"]["xG"]),
            "xga_away": float(m["a"]["xGA"]),
        })
    return pd.DataFrame(rows)


def build_understat_xg(league_code: str) -> pd.DataFrame | None:
    """All configured seasons joined to canonical team names; keyed for
    merging on (date, home, away) with the football-data matches table."""
    seasons = LEAGUES[league_code]["seasons"]
    frames = []
    for season_code in seasons:
        start_year = 2000 + int(season_code[:2])
        df = fetch_season(start_year)
        if df is None:
            return None
        df["season"] = f"{start_year}/{(start_year + 1) % 100:02d}"
        frames.append(df)
    out = pd.concat(frames, ignore_index=True)
    for col in ("understat_home", "understat_away"):
        alias = {**UNDERSTAT_ALIASES, **TEAM_ALIASES}
        out[col.replace("understat_", "")] = out[col].map(
            lambda name: alias.get(name, name))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--league", default="SP1")
    args = parser.parse_args()

    target = RAW_DIR / f"{args.league}_understat_xg.parquet"
    if target.exists() and not args.refresh:
        print(f"cached: {target}")
        return
    try:
        df = build_understat_xg(args.league)
    except requests.RequestException as exc:
        print(f"understat unreachable: {exc}; skipping xG features")
        return
    if df is None:
        print("understat unavailable (site down or data missing); "
              "pipeline runs without xG features")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(target, index=False)
    print(f"saved {len(df)} rows to {target}")


if __name__ == "__main__":
    main()
