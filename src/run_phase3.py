"""Phase 3: pre-match ML features + CatBoost/XGBoost, tuned on validation.

Protocol:
    - Features (src/features.py) are computed once in a chronological
      pass and can never use a match's own outcome.
    - Hyperparameter tuning runs per validation season (expanding fits,
      predictions for each season made by a model fit on strictly
      earlier data). The locked test period is untouched while tuning.
    - The final comparison re-runs the full walk-forward engine at
      matchweek granularity with: base rates, de-vigged bookmaker,
      Dixon-Coles (xi locked from Phase 2), tuned CatBoost and tuned
      XGBoost — all predicting the identical matches.

Usage:
    .venv/bin/python -m src.run_phase3 [--with-xg]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from .backtest import BaseRates, DeviggedBookmaker, DixonColes, run_backtest
from .build_dataset import build
from .features import build_features
from .metrics import METRICS
from .ml_models import CatBoostModel, XGBoostModel
from .run_phase2 import (
    REPORTS_DIR,
    TEST_START,
    VALIDATION_END,
    VALIDATION_START,
    calibration_plot,
    locked_test_table,
    paired_test_table,
    per_season_table,
)

CATBOOST_GRID = [
    dict(depth=4, learning_rate=0.05),
    dict(depth=6, learning_rate=0.05),
    dict(depth=4, learning_rate=0.1),
    dict(depth=6, learning_rate=0.1),
]
XGBOOST_GRID = [
    dict(depth=4, learning_rate=0.05),
    dict(depth=6, learning_rate=0.05),
    dict(depth=4, learning_rate=0.1),
    dict(depth=6, learning_rate=0.1),
]
DC_XI = 0.001  # locked in Phase 2 on the validation period


def tune_on_validation(featured: pd.DataFrame, family_name: str,
                       cls, grid: list[dict]) -> pd.DataFrame:
    """Expanding-window validation tuning: fit once per validation
    season on strictly earlier data, score that whole season."""
    matches = featured.sort_values("date", kind="stable")
    val_seasons = sorted(
        s for s in matches["season"].unique()
        if VALIDATION_START <= s <= VALIDATION_END
    )
    rows = []
    for config in grid:
        preds_all = []
        for season in val_seasons:
            anchor = matches[matches["season"] == season]["date"].min()
            history = matches[matches["date"] < anchor]
            block = matches[matches["season"] == season]
            model = cls(**config)
            model.fit(history)
            scored = block[["season", "date", "result"]].copy()
            scored[["p_h", "p_d", "p_a"]] = model.predict(block)
            preds_all.append(scored)
        preds = pd.concat(preds_all, ignore_index=True)
        p = preds[["p_h", "p_d", "p_a"]].to_numpy()
        y = preds["result"].to_numpy()
        rows.append({
            **config,
            "family": family_name,
            "RPS": round(float(METRICS["RPS"](p, y).mean()), 5),
            "log_loss": round(float(METRICS["log_loss"](p, y).mean()), 5),
            "accuracy": round(float(METRICS["accuracy"](p, y).mean()), 4),
            "n": len(preds),
        })
        print(rows[-1])
    return pd.DataFrame(rows)


def bookmaker_benchmark_segments(preds: pd.DataFrame) -> pd.DataFrame:
    """2025/26 caveat: the bookmaker odds switch from Pinnacle to Bet365
    mid-season (15 Dec 2025). Report the bookmaker benchmark per source
    so its quality (and the comparison against it) is transparent."""
    from .metrics import avg_metrics

    book = preds[(preds["season"] >= TEST_START)
                 & (preds["model"] == "Bookmaker (de-vigged)")]
    rows = []
    segments = {
        "all rows": book,
        "2025/26 Pinnacle rows": book[book["season"] == "2025/26"]
            [~book[book["season"] == "2025/26"]["odds_source"]
             .str.contains("Bet365", na=False)],
        "2025/26 Bet365 rows": book[book["season"] == "2025/26"]
            [book[book["season"] == "2025/26"]["odds_source"]
             .str.contains("Bet365", na=False)],
    }
    for label, seg in segments.items():
        if seg.empty:
            continue
        stats = avg_metrics(seg[["p_h", "p_d", "p_a"]].to_numpy(),
                            seg["result"].to_numpy())
        rows.append({"segment": label, "n": len(seg),
                     **{k: round(v, 5) for k, v in stats.items()}})
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--with-xg", action="store_true",
                        help="join cached Understat xG data if available")
    args = parser.parse_args()

    REPORTS_DIR.mkdir(exist_ok=True)
    matches = build("SP1")

    if args.with_xg:
        xg_path = Path(__file__).resolve().parent.parent / "data" / "raw" / \
            "SP1_understat_xg.parquet"
        if xg_path.exists():
            xg = pd.read_parquet(xg_path)
            matches = matches.merge(
                xg[["date", "home", "away", "xgf_home", "xga_home",
                    "xgf_away", "xga_away"]],
                on=["date", "home", "away"], how="left",
            )
        else:
            print("No cached Understat xG found; running without xG\n")

    featured = build_features(matches)
    assert len(featured) == len(matches)

    print("=== Tuning on validation (expanding, one fit per season) ===\n")
    tuning = pd.concat(
        [
            tune_on_validation(featured, "CatBoost", CatBoostModel, CATBOOST_GRID),
            tune_on_validation(featured, "XGBoost", XGBoostModel, XGBOOST_GRID),
        ],
        ignore_index=True,
    )
    tuning.to_csv(REPORTS_DIR / "ml_tuning.csv", index=False)
    best = tuning.loc[tuning.groupby("family")["RPS"].idxmin()]
    print("\nBest config per family (validation RPS):\n",
          best.to_string(index=False), "\n")

    models = {
        "Dixon-Coles (time decay)": DixonColes(xi=DC_XI),
        "Base rates": BaseRates(),
        "Bookmaker (de-vigged)": DeviggedBookmaker(),
    }
    for row in best.itertuples(index=False):
        cfg = {"depth": row.depth, "learning_rate": row.learning_rate}
        if row.family == "CatBoost":
            models["CatBoost (tuned)"] = CatBoostModel(**cfg)
        else:
            models["XGBoost (tuned)"] = XGBoostModel(**cfg)

    print("=== Final walk-forward (matchweek refits; single test touch) ===\n")
    preds = run_backtest(featured, models, score_from_season=VALIDATION_START,
                         log_progress=True)
    preds.to_parquet(
        Path(__file__).resolve().parent.parent / "data" / "processed"
        / "backtest_predictions_ml.parquet", index=False)

    wide, ci_rps = locked_test_table(preds)
    print("Locked test table:\n", wide.to_string(), "\n")
    print("RPS 95% bootstrap CI:\n", ci_rps.to_string(), "\n")
    pairs = paired_test_table(preds)
    print("Paired comparisons (test):\n", pairs.to_string(), "\n")
    segments = bookmaker_benchmark_segments(preds)
    print("Bookmaker benchmark segments (test):\n", segments.to_string(), "\n")

    per_season = per_season_table(preds)
    calibration_plot(preds, REPORTS_DIR / "calibration_ml.png")

    wide.to_csv(REPORTS_DIR / "test_metrics_ml.csv")
    pairs.to_csv(REPORTS_DIR / "paired_tests_ml.csv", index=False)
    segments.to_csv(REPORTS_DIR / "bookmaker_segments.csv", index=False)
    per_season.to_csv(REPORTS_DIR / "per_season_metrics_ml.csv", index=False)
    print(f"\nReports in {REPORTS_DIR}/.")


if __name__ == "__main__":
    main()
