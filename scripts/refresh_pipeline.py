#!/usr/bin/env python3
"""Refresh the site's real data inputs and (optionally) re-export forecasts.

What it does, using only free sources already part of this project:

1. `--results`  download football-data.co.uk's 2026/27 SP1 season file into
                `data/raw/SP1_2627.csv` (results, xG, closing odds).
2. `--fixtures` download openfootball's public 2026/27 La Liga schedule into
                `data/raw/schedule_2627.json` (rounds, dates, pairings), then
                write the unplayed future fixtures into `data/raw/fixtures.csv`
                in football-data's layout — but only when football-data's own
                fixtures file has no future SP1 rows (it publishes them late).
3. `--site`     run `scripts/export_site_data.py` to rebuild
                `data/website/season_results.csv`.
4. `--predict`  re-run the existing Phase 4.5 live export (refits Dixon-Coles
                xi=0.001 and CatBoost depth 4 / lr 0.05 on all completed
                matches, blend weight fixed at 0.35, no re-tuning) so
                `data/website/upcoming_predictions.csv` covers the fixtures
                that are actually unplayed.

The modelling methodology, blend weight and locked evaluation are untouched:
this calls the same `src.export_website.export_live` used by the project.

Usage:
    .venv/bin/python scripts/refresh_pipeline.py               # all steps
    .venv/bin/python scripts/refresh_pipeline.py --predict     # also forecasts
    .venv/bin/python scripts/refresh_pipeline.py --skip-download
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

RAW = os.path.join(ROOT, "data", "raw")
RESULTS_SRC = os.path.join(RAW, "SP1_2627.csv")
FIXTURES_CACHE = os.path.join(RAW, "fixtures.csv")
SCHEDULE = os.path.join(RAW, "schedule_2627.json")

FD_RESULTS = "https://www.football-data.co.uk/mmz4281/2627/SP1.csv"
FD_FIXTURES = "https://www.football-data.co.uk/fixtures.csv"
OPENFOOTBALL = (
    "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/es.1.json"
)
UA = "football-score-predictor/0.2 (research project; data refresh)"

# openfootball's full club names -> football-data spellings (which
# src.config.TEAM_ALIASES already maps to canonical pipeline names).
OPENFOOTBALL_TEAMS = {
    "Athletic Club": "Ath Bilbao",
    "CA Osasuna": "Osasuna",
    "Club Atlético de Madrid": "Ath Madrid",
    "Deportivo Alavés": "Alaves",
    "Elche CF": "Elche",
    "FC Barcelona": "Barcelona",
    "Getafe CF": "Getafe",
    "Levante UD": "Levante",
    "Málaga CF": "Malaga",
    "RC Celta de Vigo": "Celta",
    "RC Deportivo La Coruña": "La Coruna",
    "RCD Espanyol de Barcelona": "Espanol",
    "Rayo Vallecano de Madrid": "Vallecano",
    "Real Betis Balompié": "Betis",
    "Real Madrid CF": "Real Madrid",
    "Real Racing Club de Santander": "Santander",
    "Real Sociedad de Fútbol": "Sociedad",
    "Sevilla FC": "Sevilla",
    "Valencia CF": "Valencia",
    "Villarreal CF": "Villarreal",
}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def download(url: str, target: str, label: str) -> bool:
    try:
        payload = fetch(url)
    except Exception as error:  # noqa: BLE001 - report, never crash the refresh
        print(f"  ! {label}: {error}")
        return False
    previous = open(target, "rb").read() if os.path.exists(target) else None
    changed = previous != payload
    if changed:
        with open(target, "wb") as handle:
            handle.write(payload)
    print(f"  {label}: {len(payload)} bytes, {'updated' if changed else 'unchanged'}")
    return True


def iso_date(raw: str) -> str | None:
    try:
        day, month, year = raw.strip().split("/")
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    except ValueError:
        return None


def played_pairs() -> set[tuple[str, str, str]]:
    if not os.path.exists(RESULTS_SRC):
        return set()
    with open(RESULTS_SRC, encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    pairs = set()
    for row in rows:
        if not row.get("HomeTeam") or not row.get("FTHG"):
            continue
        day = iso_date(row.get("Date", ""))
        if day:
            pairs.add((day, row["HomeTeam"].strip(), row["AwayTeam"].strip()))
    return pairs


def build_schedule() -> list[dict] | None:
    try:
        payload = json.loads(fetch(OPENFOOTBALL))
    except Exception as error:  # noqa: BLE001
        print(f"  ! openfootball schedule: {error}")
        return None

    matches = []
    for match in payload.get("matches", []):
        home_long = match.get("team1")
        away_long = match.get("team2")
        if home_long not in OPENFOOTBALL_TEAMS or away_long not in OPENFOOTBALL_TEAMS:
            continue
        round_label = str(match.get("round") or "")
        digits = "".join(character for character in round_label if character.isdigit())
        matches.append(
            {
                "round": round_label or None,
                "matchweek": int(digits) if digits else None,
                "date": match.get("date"),
                "time": match.get("time"),
                "home": OPENFOOTBALL_TEAMS[home_long],
                "away": OPENFOOTBALL_TEAMS[away_long],
                "home_long": home_long,
                "away_long": away_long,
            }
        )

    with open(SCHEDULE, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "source": OPENFOOTBALL,
                "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "matches": matches,
            },
            handle,
            ensure_ascii=False,
            indent=1,
        )
    print(f"  schedule: {len(matches)} fixtures from openfootball")
    return matches


def football_data_future_rows() -> list[dict]:
    """SP1 rows in football-data's fixtures file that are still in the future."""
    if not os.path.exists(FIXTURES_CACHE):
        return []
    today = dt.date.today().isoformat()
    with open(FIXTURES_CACHE, encoding="utf-8-sig") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("Div") == "SP1"]
    future = []
    for row in rows:
        day = iso_date(row.get("Date", "") or "")
        if day and day >= today and row.get("HomeTeam") and row.get("AwayTeam"):
            future.append(row)
    return future


def write_fixtures(schedule: list[dict] | None) -> None:
    """Write unplayed future fixtures in football-data's layout."""
    today = dt.date.today().isoformat()
    played = played_pairs()

    if schedule:
        rows = []
        for match in schedule:
            if not match.get("date") or match["date"] < today:
                continue
            if (match["date"], match["home"], match["away"]) in played:
                continue
            year, month, day = match["date"].split("-")
            rows.append(
                {
                    "Div": "SP1",
                    "Date": f"{day}/{month}/{year}",
                    "Time": match.get("time") or "",
                    "HomeTeam": match["home"],
                    "AwayTeam": match["away"],
                }
            )
    else:
        rows = [
            {
                "Div": "SP1",
                "Date": row["Date"],
                "Time": row.get("Time") or "",
                "HomeTeam": row["HomeTeam"],
                "AwayTeam": row["AwayTeam"],
            }
            for row in football_data_future_rows()
        ]

    if not rows:
        print("  ! no future fixtures found in either source")
        return

    columns = ["Div", "Date", "Time", "HomeTeam", "AwayTeam"]
    with open(FIXTURES_CACHE, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  fixtures.csv: {len(rows)} unplayed future fixtures")


def run_site_export() -> None:
    subprocess.run(
        [sys.executable, os.path.join(ROOT, "scripts", "export_site_data.py")],
        cwd=ROOT,
        check=True,
    )


def run_ledger_steps() -> None:
    """Keep the ledger and the served grids in step with the exports.

    Conversion only: the grids come from the parquet the export just wrote, and
    the ledger imports the CSVs. Nothing here refits or re-prices a model.
    """
    steps = [
        ([sys.executable, os.path.join(ROOT, "scripts", "export_scorelines_json.py")], "grid conversion"),
        (["node", os.path.join(ROOT, "scripts", "build_scoreline_files.mjs")], "grid split"),
        (["node", os.path.join(ROOT, "scripts", "sync_ledger.mjs")], "ledger sync"),
    ]
    for command, label in steps:
        try:
            subprocess.run(command, cwd=ROOT, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError) as error:
            print(f"  ! {label} failed: {error}")


def run_predictions() -> None:
    from src.build_dataset import build
    from src.export_website import export_live

    print("  refitting the live models (same methodology: DC xi=0.001, CatBoost d4/lr0.05, blend 0.35)")
    predictions = export_live(build("SP1"))
    print(f"  predictions: {len(predictions)} upcoming fixtures exported")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", action="store_true", help="refresh results CSV only")
    parser.add_argument("--fixtures", action="store_true", help="refresh schedule + fixtures only")
    parser.add_argument("--predict", action="store_true", help="re-run the live prediction export")
    parser.add_argument("--skip-download", action="store_true", help="use cached raw files")
    args = parser.parse_args()

    everything = not (args.results or args.fixtures or args.predict)
    do_results = everything or args.results
    do_fixtures = everything or args.fixtures

    if do_results and not args.skip_download:
        print("results")
        download(FD_RESULTS, RESULTS_SRC, "football-data 2026/27 SP1")

    schedule = None
    if do_fixtures:
        print("fixtures")
        if not args.skip_download:
            download(FD_FIXTURES, os.path.join(RAW, "football-data-fixtures.csv"), "football-data fixtures")
        schedule = build_schedule()
        write_fixtures(schedule)

    if do_results:
        print("site results export")
        run_site_export()

    if args.predict:
        print("predictions")
        run_predictions()

    if do_results or args.predict:
        print("ledger")
        run_ledger_steps()

    print("done")


if __name__ == "__main__":
    main()
