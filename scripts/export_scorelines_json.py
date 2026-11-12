#!/usr/bin/env python3
"""Dump the upcoming 15x15 scoreline grids to JSON so the Node server can serve them.

This is a *format conversion only*: it reads the existing
`upcoming_scorelines.parquet` export and writes the same numbers to
`data/website/scorelines_raw.json`. It does not refit, re-predict, round or
alter any probability.

Team slugs are resolved afterwards by `scripts/build_scoreline_files.mjs`, which
uses the same registry as the server, so both always agree.

Run `node scripts/build_scoreline_files.mjs` next.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARQUET = os.path.join(ROOT, "data", "website", "upcoming_scorelines.parquet")
TOP5 = os.path.join(ROOT, "data", "website", "upcoming_scorelines_top5.csv")
OUT = os.path.join(ROOT, "data", "website", "scorelines_raw.json")
SIZE = 15


def main() -> None:
    if not os.path.exists(PARQUET):
        raise SystemExit(f"missing {PARQUET} — run the live export first")

    grids = pd.read_parquet(PARQUET)
    top5 = pd.read_csv(TOP5) if os.path.exists(TOP5) else None
    generated = datetime.fromtimestamp(os.path.getmtime(PARQUET), tz=timezone.utc).isoformat()

    if top5 is not None:
        top5 = top5.assign(date=top5["date"].astype(str).str.slice(0, 10))

    rows = []
    for row in grids.itertuples(index=False):
        date = pd.Timestamp(row.date).strftime("%Y-%m-%d")
        flat = [float(value) for value in row.grid]
        if len(flat) != SIZE * SIZE:
            print(f"  ! {date} {row.home} v {row.away}: {len(flat)} cells, skipped")
            continue
        top = []
        if top5 is not None:
            subset = top5[
                (top5["date"] == date) & (top5["home"] == row.home) & (top5["away"] == row.away)
            ]
            top = [
                {"home": int(r.home_goals), "away": int(r.away_goals), "p": float(r.prob)}
                for r in subset.itertuples(index=False)
            ]
        rows.append(
            {
                "date": date,
                "home": row.home,
                "away": row.away,
                "generatedAt": generated,
                "grid": flat,
                "top": top,
            }
        )

    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(rows, handle, separators=(",", ":"))
    print(f"  scorelines: {len(rows)} fixtures dumped to data/website/scorelines_raw.json")


if __name__ == "__main__":
    main()
