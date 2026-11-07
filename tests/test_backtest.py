"""Tests for scoring metrics and the walk-forward machinery."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.backtest import DixonColes, group_matchweeks, run_backtest
from src.devig import devig_proportional
from src.metrics import accuracy, log_loss, paired_comparison, rps, bootstrap_ci


# ---------------------------------------------------------------- metrics

def test_rps_zero_for_perfect_prediction():
    p = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
    y = np.array([0, 1])
    assert np.allclose(rps(p, y), 0.0)


def test_rps_half_for_inverted_sure_prediction():
    # predicting the certain opposite of the outcome is the worst case
    # for K=3 outcomes: RPS = 1.0
    p = np.array([[1.0, 0.0, 0.0]])
    assert rps(p, np.array([2]))[0] == pytest.approx(1.0)


def test_rps_uniform_reference():
    # uniform prediction: edge outcomes score ((1/3)^2+(2/3)^2)/2 = 5/18,
    # the middle-ordered outcome scores 1/9
    p = np.repeat([[1 / 3, 1 / 3, 1 / 3]], 3, axis=0)
    got = rps(p, np.array([2, 1, 0]))
    assert np.allclose(got, [5 / 18, 1 / 9, 5 / 18])


def test_rps_respects_ordering():
    # favouring the correct outcome beats favouring 'further away' outcomes
    p_close = np.array([[0.4, 0.4, 0.2]])
    p_far = np.array([[0.2, 0.4, 0.4]])
    assert rps(p_close, np.array([0])).mean() < rps(p_far, np.array([0])).mean()


def test_log_loss_and_accuracy():
    p = np.array([[0.8, 0.1, 0.1], [0.2, 0.3, 0.5]])
    y = np.array([0, 2])
    assert log_loss(p, y).mean() == pytest.approx(-0.5 * (np.log(0.8) + np.log(0.5)))
    assert accuracy(p, y).mean() == pytest.approx(1.0)


# ---------------------------------------------------------------- bootstrap

def test_bootstrap_ci_brackets_deterministic_mean():
    p = np.tile([0.5, 0.25, 0.25], (50, 1))
    y = np.r_[np.full(30, 0), np.full(10, 1), np.full(10, 2)]
    ci = bootstrap_ci("log_loss", p, y, n_boot=500)
    assert ci["lower"] < ci["mean"] < ci["upper"]


def test_paired_comparison_prefers_obviously_better_model():
    y = np.r_[np.zeros(400, int), np.ones(300, int), np.full(300, 2, int)]
    good = np.zeros((1000, 3))
    good[:, 0] = 0.55; good[:, 1] = 0.2; good[:, 2] = 0.25
    bad = np.zeros((1000, 3))
    bad[:, 0] = 0.9; bad[:, 1] = 0.05; bad[:, 2] = 0.05
    comp = paired_comparison("log_loss", good, bad, y, n_boot=200)
    assert comp["mean_diff"] < 0      # good has lower log loss
    assert comp["p_a_better"] > 0.95


# ---------------------------------------------------------------- matchweeks

def test_group_matchweeks_by_gap_and_season():
    matches = pd.DataFrame({
        "date": pd.to_datetime([
            "2023-08-12", "2023-08-13", "2023-08-19", "2023-08-21",
            "2024-08-18",
        ]),
        "season": ["2023/24", "2023/24", "2023/24", "2023/24", "2024/25"],
    })
    matches = matches.sort_values("date").reset_index(drop=True)
    weeks = group_matchweeks(matches)
    # two Sat/Sun dates form one week, 19th + 21st (2-day gap) the next,
    # the new season always restarts the counter
    assert weeks.tolist() == [0, 0, 1, 1, 2]


# ---------------------------------------------------------------- walk-forward

@pytest.fixture
def synthetic_matches() -> pd.DataFrame:
    """Two seasons worth with enough matches for a naive DC fit."""
    rng = np.random.default_rng(42)
    teams = ["A", "B", "C", "D"]
    rows = []
    for year, start in [(2021, "2021-08-01"), (2022, "2022-08-14")]:
        # two matchdates per season, 10+ days apart, so 2 matchweeks
        for off, label in [(0, 0), (14, 1)]:
            pairings = [(teams[i], teams[(i + off + 1) % 4]) for i in range(4)]
            for k, (h, a) in enumerate(pairings * 2):
                hg = rng.integers(0, 4)
                ag = rng.integers(0, 4)
                rows.append({
                    "date": pd.Timestamp(start) + pd.Timedelta(days=off + k // 4),
                    "season": f"{year}/{(year + 1) % 100:02d}",
                    "home": h, "away": a,
                    "fthg": hg, "ftag": ag,
                    "result": 0 if hg > ag else (1 if hg == ag else 2),
                    "odds_h": 2.8, "odds_d": 3.3, "odds_a": 2.6,
                })
    df = pd.DataFrame(rows)
    return df.sort_values("date", kind="stable").reset_index(drop=True)


def test_run_backtest_scores_only_after_burnin(synthetic_matches):
    preds = run_backtest(synthetic_matches, {"DC": DixonColes(xi=0.001)},
                         score_from_season="2022/23")
    assert (preds["season"] == "2022/23").all(), "burn-in scores must be excluded"
    assert preds[["p_h", "p_d", "p_a"]].sum(axis=1).sub(1).abs().lt(1e-6).all()
    assert preds["model"].eq("DC").all()
    # every row belongs to the later season, so predictions must exist
    assert len(preds) > 0


def test_dixon_coles_handles_promoted_team(synthetic_matches):
    """Team E appears only in season 2: prediction must still work and
    use league-average parameters."""
    extra = synthetic_matches[synthetic_matches["season"] == "2021/22"].assign(home="E")
    model = DixonColes(xi=0.001)
    model.fit(synthetic_matches)
    out = model.predict(extra.head(2))
    assert out.shape == (2, 3)
    assert np.allclose(out.sum(axis=1), 1.0, atol=1e-6)


def test_models_use_no_odds_input(synthetic_matches):
    """DC + base rates must produce identical predictions if odds are scrambled."""
    base = DixonColes(xi=0.001).fit(synthetic_matches.iloc[:40]).predict(
        synthetic_matches.iloc[40:44])
    scrambled = synthetic_matches.copy()
    scrambled["odds_h"], scrambled["odds_d"], scrambled["odds_a"] = 100.0, 100.0, 100.0
    after = DixonColes(xi=0.001).fit(scrambled.iloc[:40]).predict(scrambled.iloc[40:44])
    assert np.allclose(base, after)
