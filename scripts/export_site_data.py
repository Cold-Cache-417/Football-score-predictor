#!/usr/bin/env python3
"""Export the real 2026/27 season results for the website.

Reads the football-data.co.uk season file (data/raw/SP1_2627.csv) and writes a
compact, site-ready CSV (data/website/season_results.csv) with:

- ISO dates and kickoff times
- team slugs matching the website team registry
- final scores and real expected goals (HxG/AxG)
- B365 closing odds (fallback: pre-match B365, then market average)
- an honest matchweek estimate: a fixture's MW is one more than the highest
  number of games either side had already played (postponement-safe)

Stdlib only — no virtualenv needed.
"""

import csv
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "SP1_2627.csv")
OUT = os.path.join(ROOT, "data", "website", "season_results.csv")

# football-data.co.uk team names -> website slugs
ALIAS = {
    "alaves": "ala",
    "ath bilbao": "ath",
    "athletic bilbao": "ath",
    "ath madrid": "atm",
    "atletico madrid": "atm",
    "barcelona": "bar",
    "betis": "bet",
    "real betis": "bet",
    "celta": "cel",
    "celta vigo": "cel",
    "elche": "elc",
    "espanol": "esp",
    "espanyol": "esp",
    "getafe": "get",
    "la coruna": "dep",
    "deportivo la coruna": "dep",
    "deportivo": "dep",
    "levante": "lev",
    "malaga": "mal",
    "osasuna": "osa",
    "real madrid": "rma",
    "santander": "rac",
    "racing santander": "rac",
    "sevilla": "sev",
    "sociedad": "rso",
    "real sociedad": "rso",
    "valencia": "val",
    "vallecano": "ray",
    "rayo vallecano": "ray",
    "villarreal": "vil",
}


def slug(name):
    key = name.strip().lower()
    if key not in ALIAS:
        raise ValueError(f"Unknown team name: {name!r} — add it to ALIAS")
    return ALIAS[key]


def iso_date(raw):
    d, m, y = raw.strip().split("/")
    return f"{y}-{m}-{d}"


def first_float(*values):
    for v in values:
        v = (v or "").strip()
        if v:
            try:
                return float(v)
            except ValueError:
                continue
    return None


def main():
    with open(SRC, encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if r.get("HomeTeam")]

    # count prior games per team to derive an honest matchweek
    played = {}
    out_rows = []
    for r in rows:
        h, a = slug(r["HomeTeam"]), slug(r["AwayTeam"])
        mw = max(played.get(h, 0), played.get(a, 0)) + 1
        played[h] = played.get(h, 0) + 1
        played[a] = played.get(a, 0) + 1

        odds_h = first_float(r.get("B365CH"), r.get("B365H"), r.get("AvgCH"), r.get("AvgH"))
        odds_d = first_float(r.get("B365CD"), r.get("B365D"), r.get("AvgCD"), r.get("AvgD"))
        odds_a = first_float(r.get("B365CA"), r.get("B365A"), r.get("AvgCA"), r.get("AvgA"))

        out_rows.append({
            "season": "2026/27",
            "date": iso_date(r["Date"]),
            "time": (r.get("Time") or "").strip(),
            "home": r["HomeTeam"].strip(),
            "away": r["AwayTeam"].strip(),
            "home_slug": h,
            "away_slug": a,
            "fthg": r.get("FTHG", ""),
            "ftag": r.get("FTAG", ""),
            "hxg": r.get("HxG", ""),
            "axg": r.get("AxG", ""),
            "odds_h": odds_h if odds_h else "",
            "odds_d": odds_d if odds_d else "",
            "odds_a": odds_a if odds_a else "",
            "mw": mw,
        })

    out_rows.sort(key=lambda r: (r["date"], r["time"] or "99:99"))

    fields = ["season", "date", "time", "home", "away", "home_slug", "away_slug",
              "fthg", "ftag", "hxg", "axg", "odds_h", "odds_d", "odds_a", "mw"]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out_rows)

    mws = sorted({r["mw"] for r in out_rows})
    print(f"Wrote {len(out_rows)} results ({mws[0]}–{mws[-1]}) -> {OUT}")


if __name__ == "__main__":
    main()
