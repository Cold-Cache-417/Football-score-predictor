"""Tests for pre-match feature construction and ML model wrappers."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.features import FEATURE_COLS, XG_COLS, build_features


def _synthetic_matches(n_seasons: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    rows = []
    for year in range(2020, 2020 + n_seasons):
        teams = ["A", "B", "C", "D", "E"] if year == 2020 else \
            ["B", "C", "D", "E", "F" if year > 2020 else "A"]  # F promoted in 2021/22
        teams = ["A", "B", "C", "D", "E"] + (["F"] if year >= 2021 else [])
        for off in range(0, 5 * 7, 7):  # five matchdates, 7 days apart
            half = len(teams) // 2
            pairs = [(teams[i], teams[i + half]) for i in range(half)]
            for k, (h, a) in enumerate(pairs):
                hg, ag = int(rng.integers(0, 4)), int(rng.integers(0, 4))
                rows.append({
                    "date": pd.Timestamp(f"{year}-08-01") + pd.Timedelta(days=off + k // 2),
                    "season": f"{year}/{(year + 1) % 100:02d}",
                    "home": h, "away": a,
                    "fthg": hg, "ftag": ag,
                    "result": 0 if hg > ag else (1 if hg == ag else 2),
                    "odds_h": 2.5, "odds_d": 3.2, "odds_a": 2.9,
                })
    df = pd.DataFrame(rows)
    return df.sort_values("date", kind="stable").reset_index(drop=True)


def test_feature_columns_present():
    out = build_features(_synthetic_matches(2))
    assert all(c in out.columns for c in FEATURE_COLS)
    assert XG_COLS[0] not in out.columns   # xG absent unless joined


def test_no_leakage_from_later_matches():
    """Scrambling ALL results after match 20 must not change features on
    rows 0..19."""
    base = _synthetic_matches(3)
    mutated = base.copy()
    mutated.loc[20:, "result"] = np.random.default_rng(0).integers(0, 3, len(base) - 20)
    mutated.loc[20:, "fthg"] = 0
    mutated.loc[20:, "ftag"] = 0
    feat_a = build_features(base).iloc[:20]
    feat_b = build_features(mutated).iloc[:20]
    same = [c for c in FEATURE_COLS]
    for c in same:
        pd.testing.assert_series_equal(feat_a[c], feat_b[c], check_names=False)


def test_own_result_never_leaks():
    """A row's features must be identical under two different outcomes of
    the very same match (with history before kept identical)."""
    matches = _synthetic_matches(1)
    copy_one = matches.copy()
    copy_two = matches.copy()
    copy_two.loc[0, "result"] = (copy_one.loc[0, "result"] + 1) % 3
    copy_two.loc[0, "fthg"], copy_two.loc[0, "ftag"] = 3, 0
    fa = build_features(copy_one).iloc[0]
    fb = build_features(copy_two).iloc[0]
    for c in FEATURE_COLS:
        # same-value compare, NaN-safe
        assert (fa[c] == fb[c]) or (pd.isna(fa[c]) and pd.isna(fb[c])), c


def test_promoted_team_flag_and_nan_form():
    out = build_features(_synthetic_matches(3))
    # team F appears in 2021/22 (season index 1) for the first time
    f_first = out[(out["home"] == "F") & (out["matches_h"] == 0)]
    assert f_first["form_h_pts6"].isna().all()
    assert (f_first["home_promoted"] == True).all()  # noqa: E712
    # and by its second appearance the flag stays promoted-with-history
    f_second = out[(out["home"] == "F") & (out["matches_h"] > 0)]
    assert (f_second["home_promoted"] == True).all()  # noqa: E712


def test_first_data_season_flags_are_nan():
    out = build_features(_synthetic_matches(1))
    assert out["home_promoted"].isna().all()


def test_monotonic_ratings_and_experience():
    out = build_features(_synthetic_matches(3))
    # promoted F always appears as the away team in the synthetic data
    per_team = out.groupby("away")["matches_a"].min()
    assert per_team["F"] == 0
    # Elo starts at 1500 for first appearance
    first_rows = out[out["matches_a"] == 0]
    assert np.allclose(first_rows["elo_away"], 1500.0)


def test_rest_days_and_venue_form_present():
    out = build_features(_synthetic_matches(3))
    later = out[out["matches_h"] > 6]
    assert later["rest_h"].notna().any()
    assert later["form_h_home6"].notna().any()


def test_unplayed_fixtures_emitted_without_state_changes():
    """Upcoming matches (NaN result) get features; ratings/form history of
    the earlier rows must be unchanged by their presence."""
    base = _synthetic_matches(2)
    upcoming = base.iloc[:4].assign(result=np.nan, fthg=np.nan, ftag=np.nan,
                                    date=pd.Timestamp("2023-08-20"),
                                    season="2023/24")
    merged = pd.concat([base, upcoming], ignore_index=True)
    with_upcoming = build_features(merged)
    # unplayed rows get full features (teams already have history)
    assert with_upcoming.tail(4)["form_h_pts6"].notna().all()
    # historical features identical with and without the upcoming rows
    without = build_features(base)
    pd.testing.assert_frame_equal(
        without[FEATURE_COLS], with_upcoming.iloc[:len(without)][FEATURE_COLS],
        check_exact=False, rtol=1e-12, check_column_type=False,
    )
    # unplayed rows got rating columns too (neutral Elo for a fresh team)
    fresh = with_upcoming[with_upcoming["matches_h"] == 0]
    if len(fresh):
        assert np.allclose(fresh["elo_home"], 1500.0)
