"""Phase 2: tune Dixon-Coles time decay on validation, evaluate models
walk-forward, compare vs baselines with uncertainty, plot calibration.

Splits (fixed for the whole project):
    2010/11 - 2013/14 : burn-in (not scored)
    2014/15 - 2022/23 : validation  (xi is tuned here, nothing else)
    2023/24 - 2025/26 : locked test (evaluated once, at the end)

Usage: .venv/bin/python -m src.run_phase2
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .backtest import BaseRates, DeviggedBookmaker, DixonColes, run_backtest
from .build_dataset import build
from .metrics import avg_metrics, bootstrap_ci, paired_comparison

PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"
REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"

BURN_IN_END = "2013/14"
VALIDATION_START = "2014/15"
VALIDATION_END = "2022/23"
TEST_START = "2023/24"
XI_GRID = [0.0, 0.0005, 0.001, 0.002, 0.004, 0.008]

OUTCOME_NAMES = ["home", "draw", "away"]


def tune_xi(matches: pd.DataFrame) -> pd.DataFrame:
    """Walk-forward per xi on the validation period only."""
    rows = []
    for xi in XI_GRID:
        preds = run_backtest(
            matches, {"DC": DixonColes(xi=xi)}, score_from_season=VALIDATION_START
        )
        preds = preds[preds["season"] <= VALIDATION_END]
        stats = avg_metrics(preds[["p_h", "p_d", "p_a"]].to_numpy(),
                            preds["result"].to_numpy())
        stats["xi"] = xi
        rows.append(stats)
        print(f"xi={xi:<7} RPS {stats['RPS']:.5f}  log loss {stats['log_loss']:.5f}  "
              f"acc {stats['accuracy']:.4f}")
    return pd.DataFrame(rows).set_index("xi")


def run_final_models(matches: pd.DataFrame, xi_best: float) -> pd.DataFrame:
    """One pass over the whole scored range with all models; test-period
    predictions are stored, validation-period predictions are kept for
    the per-season table only."""
    models = {
        "Dixon-Coles (time decay)": DixonColes(xi=xi_best),
        "Base rates": BaseRates(),
        "Bookmaker (de-vigged)": DeviggedBookmaker(),
    }
    preds = run_backtest(matches, models, score_from_season=VALIDATION_START)
    out_path = PROCESSED_DIR / "backtest_predictions.parquet"
    preds.to_parquet(out_path, index=False)
    return preds


def locked_test_table(preds: pd.DataFrame, n_boot: int = 2000) -> pd.DataFrame:
    test = preds[preds["season"] >= TEST_START]
    rows = []
    for model_name, block in test.groupby("model"):
        p = block[["p_h", "p_d", "p_a"]].to_numpy()
        y = block["result"].to_numpy()
        for metric in ("RPS", "log_loss", "accuracy"):
            ci = bootstrap_ci(metric, p, y, n_boot=n_boot)
            rows.append({
                "model": model_name, "metric": metric,
                "value": round(ci["mean"], 5),
                "ci_lo": round(ci["lower"], 5), "ci_hi": round(ci["upper"], 5),
            })
    table = pd.DataFrame(rows)
    wide = table.pivot(index="metric", columns="model", values="value")
    ci_txt = table[table["metric"] == "RPS"].set_index("model")
    return wide, ci_txt


def paired_test_table(preds: pd.DataFrame) -> pd.DataFrame:
    test = preds[preds["season"] >= TEST_START]
    by_model = {name: g.sort_values("date") for name, g in test.groupby("model")}
    names = list(by_model)
    rows = []
    for m_a in names:
        for m_b in names:
            if m_a >= m_b:
                continue
            a, b = by_model[m_a], by_model[m_b]
            assert (a["date"].to_numpy() == b["date"].to_numpy()).all()
            for metric in ("RPS", "log_loss", "accuracy"):
                comp = paired_comparison(
                    metric, a[["p_h", "p_d", "p_a"]].to_numpy(),
                    b[["p_h", "p_d", "p_a"]].to_numpy(),
                    a["result"].to_numpy(), n_boot=2000,
                )
                rows.append({
                    "A": m_a, "B": m_b, "metric": metric,
                    "mean(A-B)": round(comp["mean_diff"], 5),
                    "ci_lo": round(comp["lower"], 5),
                    "ci_hi": round(comp["upper"], 5),
                    "P(A better)": round(comp["p_a_better"], 2),
                })
    return pd.DataFrame(rows)


def per_season_table(preds: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (season, model), block in preds.groupby(["season", "model"]):
        stats = avg_metrics(block[["p_h", "p_d", "p_a"]].to_numpy(),
                            block["result"].to_numpy())
        rows.append({"season": season, "model": model, "n": len(block),
                     **{k: round(v, 5) for k, v in stats.items()}})
    return pd.DataFrame(rows).sort_values(["season", "model"])


def calibration_plot(preds: pd.DataFrame, path: Path) -> pd.DataFrame:
    test = preds[preds["season"] >= TEST_START]
    models = sorted(test["model"].unique())
    fig, axes = plt.subplots(1, len(models), figsize=(5 * len(models), 4.2),
                             sharey=True)
    table_rows = []
    for ax, model_name in zip(np.atleast_1d(axes), models):
        block = test[test["model"] == model_name]
        p = block[["p_h", "p_d", "p_a"]].to_numpy()
        y = block["result"].to_numpy()
        for outcome_idx in range(3):
            probs = p[:, outcome_idx]
            hits = y == outcome_idx
            bins = np.clip((probs * 10).astype(int), 0, 9)
            for b in range(10):
                in_bin = bins == b
                if in_bin.sum() < 10:
                    continue
                table_rows.append({
                    "model": model_name, "outcome": OUTCOME_NAMES[outcome_idx],
                    "bin_low": b / 10,
                    "mean_pred": round(float(probs[in_bin].mean()), 4),
                    "freq": round(float(hits[in_bin].mean()), 4),
                    "n": int(in_bin.sum()),
                })
            tbl = pd.DataFrame(
                [r for r in table_rows if r["model"] == model_name
                 and r["outcome"] == OUTCOME_NAMES[outcome_idx]]
            )
            ax.plot(tbl["mean_pred"], tbl["freq"], "o-",
                    label=OUTCOME_NAMES[outcome_idx])
        ax.plot([0, 1], [0, 1], "k--", lw=0.5)
        ax.set_title(model_name)
        ax.set_xlabel("mean predicted probability")
        ax.legend()
    axes[0].set_ylabel("observed frequency")
    fig.suptitle(f"Calibration, locked test period (seasons {TEST_START} onward)")
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    return pd.DataFrame(table_rows)


def main() -> None:
    REPORTS_DIR.mkdir(exist_ok=True)
    matches = build("SP1")

    print("=== Tuning xi on the validation period "
          f"({VALIDATION_START} to {VALIDATION_END}) ===\n")
    tuning = tune_xi(matches)
    tuning.to_csv(REPORTS_DIR / "xi_tuning.csv")
    xi_best = tuning["RPS"].idxmin()
    print(f"\n--> selected xi = {xi_best}\n")

    print("=== Walk-forward predictions for all models "
          f"(validation {VALIDATION_START}-{VALIDATION_END}, "
          f"test {TEST_START}-2025/26) ===\n")
    preds = run_final_models(matches, float(xi_best))

    wide, ci_rps = locked_test_table(preds)
    print("Locked test table (mean metrics):\n", wide.to_string(), "\n")
    print("RPS 95% bootstrap CI:\n", ci_rps.to_string(), "\n")

    pairs = paired_test_table(preds)
    print("Paired comparisons on the locked test period:\n", pairs.to_string(), "\n")

    per_season = per_season_table(preds)
    per_season.to_csv(REPORTS_DIR / "per_season_metrics.csv", index=False)

    calib = calibration_plot(preds, REPORTS_DIR / "calibration.png")
    wide.to_csv(REPORTS_DIR / "test_metrics.csv")
    pairs.to_csv(REPORTS_DIR / "paired_tests.csv", index=False)
    calib.to_csv(REPORTS_DIR / "calibration_bins.csv", index=False)
    print(f"\nSaved reports to {REPORTS_DIR}/ and predictions to "
          f"{PROCESSED_DIR}/backtest_predictions.parquet")


if __name__ == "__main__":
    main()
