"""Tests for the cleaning of football-data.co.uk CSVs."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.clean import (
    ODDS_SOURCES,
    apply_aliases,
    clean_fixtures,
    clean_matches,
    parse_date,
    season_from_date,
)


def test_parse_date_handles_both_formats():
    raw = pd.Series(["01/02/13", "31/12/2022", "15/08/2021"])
    parsed = parse_date(raw)
    assert parsed.iloc[0] == pd.Timestamp("2013-02-01")
    assert parsed.iloc[1] == pd.Timestamp("2022-12-31")
    assert parsed.iloc[2] == pd.Timestamp("2021-08-15")


def test_parse_date_leaves_garbage_as_nat():
    parsed = parse_date(pd.Series(["nope", "01/02/13"]))
    assert pd.isna(parsed.iloc[0])
    assert parsed.iloc[1] == pd.Timestamp("2013-02-01")


def test_season_from_date():
    dates = pd.Series(pd.to_datetime(
        ["2023-08-12", "2024-06-30", "2024-01-15",
         # COVID override: July 2020 still belongs to season 2019/20
         "2020-07-19", "2020-09-12"]))
    out = season_from_date(dates)
    assert out.iloc[0] == "2023/24"   # August -> new season
    assert out.iloc[1] == "2023/24"   # June -> still same season
    assert out.iloc[2] == "2023/24"   # mid-season
    assert out.iloc[3] == "2019/20"   # COVID-delayed finish
    assert out.iloc[4] == "2020/21"   # next season started September


def test_apply_aliases():
    aliases = {"Ath Madrid": "Atletico Madrid"}
    out = apply_aliases(pd.Series(["Ath Madrid", "Real Madrid"]), aliases)
    assert out.tolist() == ["Atletico Madrid", "Real Madrid"]


def test_first_available_odds_prefers_pinnacle_closing():
    raw = pd.DataFrame(
        {
            "PSCH": [1.0], "PSCD": [2.0], "PSCA": [3.0],
            "PSH": [1.5], "PSD": [2.5], "PSA": [3.5],
            "B365H": [1.6], "B365D": [2.6], "B365A": [3.6],
        }
    )
    picked = clean_matches(raw.assign(
        Date="01/08/2022", HomeTeam="A", AwayTeam="B", FTHG=1, FTAG=0, FTR="H"
    ))
    assert picked["odds_source"].iloc[0] == ODDS_SOURCES[0][1]
    assert picked["odds_h"].iloc[0] == 1.0


def test_clean_full_pipeline_on_synthetic_raw():
    raw = pd.DataFrame(
        {
            "Date": ["01/08/22", "02/08/22", "01/11/23", "02/11/23"],
            "HomeTeam": ["Ath Madrid", "Espanol", "Ath Madrid", "Ath Madrid"],
            "AwayTeam": ["Espanol", "Ath Madrid", "Sociedad", "Unknown"],
            "FTHG": [2, 1, 1, 0],
            "FTAG": [1, 1, 2, 0],
            "FTR": ["H", "D", "A", "D"],
            "B365H": [2.0, 2.0, 2.0, 2.0],
            "B365D": [3.0, np.nan, 3.0, 3.0],
            "B365A": [4.0, 4.0, 4.0, np.nan],
            "PSCH": [1.9, 1.9, 1.9, 1.9],
            "PSCD": [3.2, 3.2, 3.2, 3.2],
            "PSCA": [4.1, 4.1, 4.1, 4.1],
        }
    )
    cleaned = clean_matches(raw)
    assert len(cleaned) == 4  # nothing dropped
    # aliases applied
    assert "Atletico Madrid" in set(cleaned["home"]) | set(cleaned["away"])
    assert "Espanyol" in set(cleaned["home"]) | set(cleaned["away"])
    assert "Real Sociedad" in set(cleaned["home"]) | set(cleaned["away"])
    # season derived from date
    assert cleaned["season"].tolist() == ["2022/23", "2022/23", "2023/24", "2023/24"]
    # odds picked for every match; partial rows use the PSC columns anyway
    assert cleaned["odds_h"].notna().all()
    # matchday: dense rank of match-date within each season
    assert cleaned["matchday"].tolist() == [1, 2, 1, 2]

def test_clean_drops_incomplete_rows():
    raw = pd.DataFrame(
        {
            "Date": ["01/08/22", "02/08/22"],
            "HomeTeam": ["A", "B"],
            "AwayTeam": ["B", "C"],
            "FTHG": [1, np.nan],
            "FTAG": [1, 2],
            "FTR": ["D", "A"],
        }
    )
    cleaned = clean_matches(raw)
    assert len(cleaned) == 1


def test_clean_fixtures_keeps_only_league_unplayed_rows():
    raw = pd.DataFrame(
        {
            "Div": ["SP1", "SP1", "E0", "SP2"],
            "Date": ["07/11/26", "08/11/26", "07/11/26", "07/11/26"],
            "Time": ["13:00", "15:15", "13:00", "13:00"],
            "HomeTeam": ["Ath Madrid", "Real Madrid", "Arsenal", "Barcelona"],
            "AwayTeam": ["Espanol", "Betis", "Chelsea", "Real Sociedad"],
            "B365H": [2.0, 2.0, 2.0, 2.0],
            "B365D": [3.0, 3.0, 3.0, 3.0],
            "B365A": [4.0, 4.0, 4.0, 4.0],
        }
    )
    cleaned = clean_fixtures(raw, "SP1")
    assert len(cleaned) == 2  # other leagues filtered out
    assert set(cleaned["home"]) == {"Atletico Madrid", "Real Madrid"}
    assert cleaned["result"].isna().all()  # fixtures carry no outcome
    assert cleaned["fthg"].isna().all()
    assert cleaned["odds_h"].notna().all()
    # season derived from date (Nov 2026 -> 2026/27)
    assert cleaned["season"].tolist() == ["2026/27", "2026/27"]
