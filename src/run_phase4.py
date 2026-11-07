"""Phase 4: blend Dixon-Coles + CatBoost, tune weight on validation
per-matchweek predictions only, then evaluate once on the locked test.

Uses the saved per-week walk-forward predictions from Phase 3
(backtest_predictions_ml.parquet) — no model is refit here.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .blend import best_blend_weight, blend_probs
from .metrics import METRICS, paired_comparison

PRED_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / \
    "backtest_predictions_ml.parquet"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / \
    "backtest_predictions_blend.parquet"
REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"
TEST_START = "2023/24"
VALIDATION_END = "2022/23"


def load_predictions() -> pd.DataFrame:
    preds = pd.read_parquet(PRED_PATH)
    model_names = set(preds["model"].unique())
    assert {"Dixon-Coles (time decay)", "CatBoost (tuned)"} <= model_names
    return preds


def add_blend(preds: pd.DataFrame, w: float) -> pd.DataFrame:
    frames = []
    for name, g in preds.groupby("model"):
        g = g.copy()
        frames.append(g)
    dc = preds[preds["model"] == "Dixon-Coles (time decay)"].copy()
    cat = preds[preds["model"] == "CatBoost (tuned)"].copy()
    cols = ["season", "date", "home", "away", "result", "odds_source"]
    assert (dc[cols].to_numpy() == cat[cols].to_numpy()).all()
    blend = dc[cols + ["model"]].copy()
    blend["model"] = "Blend (DC + CatBoost)"
    blend[["p_h", "p_d", "p_a"]] = blend_probs(
        dc[["p_h", "p_d", "p_a"]].to_numpy(),
        cat[["p_h", "p_d", "p_a"]].to_numpy(), w,
    )
    return pd.concat(frames + [blend], ignore_index=True)


def tune_on_validation(preds: pd.DataFrame) -> tuple[float, pd.DataFrame]:
    val = preds[preds["season"] <= VALIDATION_END]
    dc = val[val["model"] == "Dixon-Coles (time decay)"].sort_values("date")
    cat = val[val["model"] == "CatBoost (tuned)"].sort_values("date")
    p_dc = dc[["p_h", "p_d", "p_a"]].to_numpy()
    p_cat = cat[["p_h", "p_d", "p_a"]].to_numpy()
    y = dc["result"].to_numpy()

    grid = np.linspace(0, 1, 21)
    rows = []
    for w in grid:
        p = blend_probs(p_dc, p_cat, float(w))
        rows.append({
            "w": round(float(w), 2),
            "RPS": round(float(METRICS["RPS"](p, y).mean()), 5),
            "log_loss": round(float(METRICS["log_loss"](p, y).mean()), 5),
            "accuracy": round(float(METRICS["accuracy"](p, y).mean()), 4),
        })
    curve = pd.DataFrame(rows)
    best = best_blend_weight(p_dc, p_cat, y, grid)
    return best, curve


def main() -> None:
    preds = load_predictions()

    print("=== Blend weight tuning on VALIDATION per-matchweek predictions ===\n")
    best, curve = tune_on_validation(preds)
    print(curve.to_string(index=False))
    print(f"\n--> selected w = {best['w']} "
          f"(RPS {best['RPS']:.5f}, log loss {best['log_loss']:.5f})\n")
    curve.to_csv(REPORTS_DIR / "blend_weight_tuning.csv", index=False)

    all_preds = add_blend(preds, best["w"])
    all_preds.to_parquet(OUT_PATH, index=False)

    test = all_preds[all_preds["season"] >= TEST_START]
    print("=== Locked test, single evaluation ===\n")
    rows = []
    for model_name, block in test.groupby("model"):
        p = block[["p_h", "p_d", "p_a"]].to_numpy()
        y = block["result"].to_numpy()
        for metric in ("RPS", "log_loss", "accuracy"):
            per = METRICS[metric](p, y)
            rows.append({
                "model": model_name, "metric": metric,
                "value": round(float(per.mean()), 5),
            })
    wide = pd.DataFrame(rows).pivot(index="metric", columns="model", values="value")
    order = [c for c in ["Bookmaker (de-vigged)", "Blend (DC + CatBoost)",
                         "CatBoost (tuned)", "Dixon-Coles (time decay)",
                         "XGBoost (tuned)", "Base rates"]
             if c in wide.columns]
    print(wide[order].to_string(), "\n")

    comparison_rows = []
    by_model = {n: test[test["model"] == n] for n in order}
    for m_a in order:
        for m_b in order:
            if m_a >= m_b:
                continue
            a, b = by_model[m_a], by_model[m_b]
            assert (a["date"].to_numpy() == b["date"].to_numpy()).all()
            for metric in ("RPS", "log_loss", "accuracy"):
                comp = paired_comparison(
                    metric, a[["p_h", "p_d", "p_a"]].to_numpy(),
                    b[["p_h", "p_d", "p_a"]].to_numpy(), a["result"].to_numpy())
                comparison_rows.append({
                    "A": m_a, "B": m_b, "metric": metric,
                    "mean(A-B)": round(comp["mean_diff"], 5),
                    "ci_lo": round(comp["lower"], 5),
                    "ci_hi": round(comp["upper"], 5),
                    "P(A better)": round(comp["p_a_better"], 3),
                })
    pairs = pd.DataFrame(comparison_rows)
    print("Paired comparisons (test):\n", pairs.to_string(index=False), "\n")

    # calibration plot including the blend
    from .run_phase2 import calibration_plot, per_season_table
    calibration_plot(all_preds, REPORTS_DIR / "calibration_all.png")
    per_season = per_season_table(all_preds)
    per_season.to_csv(REPORTS_DIR / "per_season_metrics_final.csv", index=False)

    wide.to_csv(REPORTS_DIR / "test_metrics_final.csv")
    pairs.to_csv(REPORTS_DIR / "paired_tests_final.csv", index=False)

    honest = pairs[(pairs["A"] == "Blend (DC + CatBoost)")
                   & (pairs["metric"] == "RPS")]
    print("Honest verdict (blend RPS paired tests):\n", honest.to_string(index=False))


if __name__ == "__main__":
    main()
