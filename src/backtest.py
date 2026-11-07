"""Walk-forward backtesting engine and the Phase 2 models.

Design:
    - Matches are grouped into "matchweeks" (restart per season; a new
      matchweek starts at a gap of >= 4 days between match dates).
    - For every matchweek, models re-fit on matches strictly *before*
      the week's first date, then predict that whole week. No future
      data (including later matches of the same week) is ever used.
    - The first seasons act as burn-in: predicted, but not scored.

Every model exposes fit(matches) and predict(matches) -> (n, 3) with
outcome order H, D, A. Model inputs contain only dates, team names and
goal history — never odds or any statistic of the match being predicted.
Odds are used only by the bookmaker *baseline* (a benchmark, not input).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .devig import devig_proportional

# penaltyblog's compiled score-matrix function; also used to predict
# newly promoted teams that were not part of the training history.
from penaltyblog.models import probabilities as pb_probs
from penaltyblog.models.football_probability_grid import FootballProbabilityGrid


def group_matchweeks(matches: pd.DataFrame) -> np.ndarray:
    """Matchweek id per row (rows must be sorted by date first)."""
    dates = pd.DatetimeIndex(matches["date"])
    seasons = matches["season"].to_numpy()
    gap_days = (np.diff(dates, prepend=dates[0]) / np.timedelta64(1, "D")).astype(int)
    new_week = (gap_days >= 4) | (np.r_[False, seasons[1:] != seasons[:-1]])
    return np.cumsum(new_week)


class BaseRates:
    """Dumb baseline: always the historical H/D/A frequencies."""

    def fit(self, history: pd.DataFrame) -> "BaseRates":
        freqs = history["result"].value_counts(normalize=True)
        self._p = np.array([freqs.get(0, 0.0), freqs.get(1, 0.0), freqs.get(2, 0.0)])
        return self

    def predict(self, matches: pd.DataFrame) -> np.ndarray:
        return np.tile(self._p, (len(matches), 1))


class DeviggedBookmaker:
    """Benchmark: de-vigged bookmaker odds, compared against but never
    fed to the forecasting models."""

    def fit(self, history: pd.DataFrame) -> "DeviggedBookmaker":  # noqa: ARG002
        return self  # stateless

    def predict(self, matches: pd.DataFrame) -> np.ndarray:
        odds = matches[["odds_h", "odds_d", "odds_a"]].to_numpy(dtype=float)
        return devig_proportional(odds)


class DixonColes:
    """Dixon-Coles goal model with time-decay weighting (penaltyblog).

    Teams that appear for the first time after the training history
    (promoted between seasons) are predicted using the league-average
    attack / defence parameters via the same score-matrix routine.
    """

    def __init__(self, xi: float):
        self.xi = xi

    def fit(self, history: pd.DataFrame) -> "DixonColes":
        import penaltyblog as pb

        weights = pb.models.dixon_coles_weights(history["date"], self.xi)
        model = pb.models.DixonColesGoalModel(
            goals_home=history["fthg"],
            goals_away=history["ftag"],
            teams_home=history["home"],
            teams_away=history["away"],
            weights=weights,
        )
        model.fit()
        param_keys = list(model.params.keys())
        self._params = model.params_array
        self._team_index = {
            key.removeprefix("attack_"): i
            for i, key in enumerate(param_keys)
            if key.startswith("attack_")
        }
        self._n_teams = len(self._team_index)
        return self

    def scoreline_grid(self, home: str, away: str):
        """Full (15, 15) scoreline grid from the fitted params.

        Rows = home goals, columns = away goals; same parameters as
        predict() (league-average fallback for unseen teams)."""
        avg_attack = float(self._params[: self._n_teams].mean())
        avg_defence = float(self._params[self._n_teams : 2 * self._n_teams].mean())
        idx_home = self._team_index.get(home)
        idx_away = self._team_index.get(away)
        att_h = self._params[idx_home] if idx_home is not None else avg_attack
        def_h = (
            self._params[idx_home + self._n_teams]
            if idx_home is not None else avg_defence
        )
        att_a = self._params[idx_away] if idx_away is not None else avg_attack
        def_a = (
            self._params[idx_away + self._n_teams]
            if idx_away is not None else avg_defence
        )
        matrix = np.empty(15 * 15)
        lambda_home, lambda_away = np.empty(1), np.empty(1)
        pb_probs.compute_dixon_coles_probabilities(
            float(att_h), float(att_a), float(def_h), float(def_a),
            float(self._params[-2]), float(self._params[-1]), 15,
            matrix, lambda_home, lambda_away,
        )
        return FootballProbabilityGrid(
            matrix.reshape(15, 15),
            float(lambda_home.item()), float(lambda_away.item()),
            normalize=True,
        )

    def predict(self, matches: pd.DataFrame) -> np.ndarray:
        preds = np.empty((len(matches), 3))
        for i, (_idx, row) in enumerate(matches.iterrows()):
            grid = self.scoreline_grid(row["home"], row["away"])
            preds[i] = grid.home_draw_away
        return preds


def run_backtest(
    matches: pd.DataFrame,
    models: dict[str, object],
    score_from_season: str,
    log_progress: bool = False,
) -> pd.DataFrame:
    """Walk-forward backtest. Returns one row per match & model with
    predicted H/D/A probabilities plus the true outcome."""
    matches = matches.sort_values("date", kind="stable").reset_index(drop=True)
    weeks = group_matchweeks(matches)
    all_weeks = sorted(set(weeks))
    scored_weeks = [
        w for w in all_weeks
        if matches.iloc[np.where(weeks == w)[0][0]]["season"] >= score_from_season
    ]
    records: list[pd.DataFrame] = []
    for step, week in enumerate(scored_weeks):
        rows = np.where(weeks == week)[0]
        this_week = matches.iloc[rows]
        history = matches.iloc[: rows[0]]  # strictly earlier matches
        if log_progress and (step % 20 == 0 or step == len(scored_weeks) - 1):
            print(f"[walk] week {step + 1}/{len(scored_weeks)} "
                  f"({len(history)} history rows)", flush=True)

        for model_name, model in models.items():
            model.fit(history)
            preds = model.predict(this_week)
            cols = ["season", "date", "home", "away", "result", "odds_source"]
            block = this_week[[c for c in cols if c in this_week.columns]].copy()
            block[["p_h", "p_d", "p_a"]] = preds
            block["model"] = model_name
            records.append(block)

    return pd.concat(records, ignore_index=True)
