"""Phase 1 pipeline: download (cached) -> clean -> de-vig -> save.

Usage:
    python -m src.build_dataset            # build La Liga dataset
    python -m src.build_dataset --refresh  # force re-download
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from .clean import clean_matches
from .config import LEAGUES
from .devig import booksum, devig_proportional, devig_shin
from .download import download_one, load_league

PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="re-download even if cached")
    return parser.parse_args()


def build(league_code: str, refresh: bool = False) -> pd.DataFrame:
    """Download, clean and de-vig. Returns the tidy match DataFrame."""
    raw = load_league(league_code, refresh=refresh)
    df = clean_matches(raw)

    odds = df[["odds_h", "odds_d", "odds_a"]].astype(float).to_numpy()
    df[["book_p_h", "book_p_d", "book_p_a"]] = devig_proportional(odds)

    out_path = PROCESSED_DIR / f"{league_code}_matches.parquet"
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, index=False)
    return df


def report(df: pd.DataFrame, league_code: str) -> None:
    print(f"\n=== {LEAGUES[league_code]['name']} dataset ===")
    print(f"matches: {len(df)}  seasons: {df['season'].nunique()}  "
          f"dates: {df['date'].min():%Y-%m-%d} to {df['date'].max():%Y-%m-%d}")

    print("\nOdds source coverage:")
    print(df["odds_source"].value_counts(normalize=True).round(3).to_string())

    bs = booksum(df[["odds_h", "odds_d", "odds_a"]].to_numpy(dtype=float))
    print(f"\nBookmaker margin: mean {bs.mean():.4f}, "
          f"median {np.median(bs):.4f}, range [{bs.min():.4f}, {bs.max():.4f}]")

    probs = df[["book_p_h", "book_p_d", "book_p_a"]].to_numpy(dtype=float)
    print(f"De-vigged probability sums: "
          f"min {probs.sum(axis=1).min():.6f}, max {probs.sum(axis=1).max():.6f}")

    # Frequency check: do de-vigged probabilities roughly match frequencies?
    freqs = [(df["result"] == k).mean() for k in range(3)]
    means = probs.mean(axis=0)
    print(f"\nOutcome frequencies vs mean book probabilities:")
    for name, freq, mean in zip(("home", "draw", "away"), freqs, means):
        print(f"  {name}: freq {freq:.3f}  book mean {mean:.3f}")

    print(f"\nTeams: {df['home'].nunique()}")
    print("\nSeason covers:")
    cover = (df.groupby("season").agg(matches=("date", "size")))
    cover["odds missing"] = df.groupby("season")[["odds_h"]].apply(lambda g: g.isna().sum())
    print(cover.to_string())
    print(f"\nSaved to data/processed/{league_code}_matches.parquet")


def main() -> None:
    args = parse_args()
    for league_code in LEAGUES:
        df = build(league_code, refresh=args.refresh)
        report(df, league_code)


if __name__ == "__main__":
    main()
