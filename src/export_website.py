"""Export the static artefacts a website needs (replaces the Phase 5 app).

Backtest artefacts (locked test period 2023/24-2025/26; produced by
src/run_phase2, src/run_phase3, src/run_phase4):
    data/website/test_predictions.csv         per test match: H/D/A probabilities
        for every model + blend, true result, de-vigged bookmaker probs + odds
        + odds source.
    data/website/test_scorelines.parquet      full (15x15) Dixon-Coles scoreline grid
        per test match, walk-forward refit per matchweek.
    data/website/test_scorelines_top5.csv     top-5 scorelines per test match.

Live / forward artefacts (Phase 4.5 — Dixon-Coles + CatBoost refitted on ALL
completed matches up to today, blend weight kept fixed at 0.35, NOT re-tuned):
    data/website/upcoming_predictions.csv     per upcoming fixture (no result yet):
        H/D/A probabilities for Dixon-Coles, CatBoost and the blend, plus the
        top scoreline. Marked prediction_type="live_forward".
    data/website/upcoming_scorelines_top5.csv top-5 scorelines per fixture.
    data/website/upcoming_scorelines.parquet   full (15x15) scoreline grid per fixture.
    data/website/models/dixon_coles.pkl       fitted Dixon-Coles model.
    data/website/models/catboost_model.cbm    fitted CatBoost model.

reports/ holds the phase result tables (test_metrics_final.csv, per_season_metrics_final.csv,
calibration_all.png, paired_tests_final.csv, blend_weight_tuning.csv, bookmaker_segments.csv).
"""

from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from .backtest import DixonColes, group_matchweeks
from .blend import blend_probs
from .build_dataset import build
from .clean import clean_fixtures
from .download import load_fixtures
from .features import build_features
from .ml_models import CatBoostModel

WEBSITE_DIR = Path(__file__).resolve().parent.parent / "data" / "website"
MODELS_DIR = WEBSITE_DIR / "models"
PROCESSED_DIR = WEBSITE_DIR.parent / "processed"
REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"

BLEND_W = 0.35
DC_XI = 0.001  # locked in Phase 2 on the validation period
CATBOOST_CFG = dict(depth=4, learning_rate=0.05)  # tuned CatBoost config (Phase 3)
TEST_START = "2023/24"
LAST_TEST_SEASON = "2025/26"  # locked test period ends here (2023/24-2025/26)
CURRENT_SEASON = "2627"  # football-data season code for 2026/27
LIVE_TYPE = "live_forward"
KEYS = ["season", "date", "home", "away", "result", "odds_source"]
PREFIXES = {
    "Dixon-Coles (time decay)": "dc",
    "CatBoost (tuned)": "cat",
    "XGBoost (tuned)": "xgb",
    "Blend (DC + CatBoost)": "blend",
    "Base rates": "base",
    "Bookmaker (de-vigged)": "book",
}


def export_test_predictions() -> pd.DataFrame:
    preds = pd.read_parquet(PROCESSED_DIR / "backtest_predictions_blend.parquet")
    test = preds[preds["season"] >= TEST_START]
    book = test[test["model"] == "Bookmaker (de-vigged)"][KEYS + ["p_h", "p_d", "p_a"]].rename(
        columns={"p_h": "book_p_h", "p_d": "book_p_d", "p_a": "book_p_a"}).copy()
    src = build("SP1")
    book = book.merge(src[KEYS + ["odds_h", "odds_d", "odds_a"]], on=KEYS, how="left")
    wide = book.copy()
    for model_name, prefix in PREFIXES.items():
        if model_name == "Bookmaker (de-vigged)":
            continue
        sub = test[test["model"] == model_name][KEYS + ["p_h", "p_d", "p_a"]].rename(
            columns={"p_h": f"{prefix}_p_h", "p_d": f"{prefix}_p_d", "p_a": f"{prefix}_p_a"})
        wide = wide.merge(sub, on=KEYS, how="left")
    wide.to_csv(WEBSITE_DIR / "test_predictions.csv", index=False)
    return wide


def _top5_from_grid(grid) -> pd.DataFrame:
    arr = np.asarray(grid, dtype=float).reshape(15, 15)
    flat = arr.reshape(-1)
    order = np.argsort(-flat)[:5]
    return pd.DataFrame({
        "home_goals": [int(i // arr.shape[1]) for i in order],
        "away_goals": [int(i % arr.shape[1]) for i in order],
        "prob": [float(flat[i]) for i in order],
    })


def export_test_scorelines() -> None:
    matches = build("SP1")
    matches = matches.sort_values("date", kind="stable").reset_index(drop=True)
    weeks = group_matchweeks(matches)
    frames = []
    dc = DixonColes(xi=DC_XI)
    for week in sorted(set(int(w) for w in weeks)):
        idx = np.where(weeks == week)[0]
        first = int(idx[0])
        if not (TEST_START <= matches.iloc[first]["season"] <= LAST_TEST_SEASON):
            continue
        dc.fit(matches.iloc[:first])
        sub = matches.iloc[idx]
        for row in sub[sub["season"] >= TEST_START].itertuples(index=False):
            grid = np.asarray(dc.scoreline_grid(row.home, row.away).goal_matrix, dtype=float)
            frames.append({
                "season": row.season, "date": row.date, "home": row.home,
                "away": row.away, "h_gf": row.fthg, "a_gf": row.ftag,
                "grid": grid.ravel().tolist(),
            })
    out = pd.DataFrame(frames)
    out.to_parquet(WEBSITE_DIR / "test_scorelines.parquet", index=False)
    tops = []
    for r in frames:
        top = _top5_from_grid(r["grid"])
        top.insert(0, "season", r["season"])
        top.insert(1, "date", r["date"])
        top.insert(2, "home", r["home"])
        top.insert(3, "away", r["away"])
        tops.append(top)
    pd.concat(tops, ignore_index=True).to_csv(WEBSITE_DIR / "test_scorelines_top5.csv", index=False)


def live_fit(completed: pd.DataFrame) -> tuple[DixonColes, CatBoostModel]:
    """Refit Dixon-Coles and CatBoost on ALL completed matches up to today."""
    dc = DixonColes(xi=DC_XI)
    dc.fit(completed)
    cat = CatBoostModel(**CATBOOST_CFG)
    cat.fit(build_features(completed))
    return dc, cat


def save_models(dc: DixonColes, cat: CatBoostModel) -> None:
    """Persist fitted models so the website / API layer never refits."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODELS_DIR / "dixon_coles.pkl", "wb") as fh:
        pickle.dump(dc, fh)
    cat.model.save_model(str(MODELS_DIR / "catboost_model.cbm"))


def predict_upcoming(completed: pd.DataFrame, upcoming: pd.DataFrame) -> tuple[pd.DataFrame, DixonColes, CatBoostModel]:
    """Fit live models on `completed`, predict `upcoming`, blend (w=0.35 fixed).

    The blended H/D/A probabilities are w * CatBoost + (1 - w) * Dixon-Coles,
    where Dixon-Coles' 1X2 marginal is derived from the full scoreline grid —
    so the grid and the blended probabilities are consistent by construction.
    Scoreline top-5s come from the Dixon-Coles grid.
    """
    dc, cat = live_fit(completed)
    combined = pd.concat([completed, upcoming], ignore_index=True)
    featured = build_features(combined)
    rows = featured[featured["result"].isna()].sort_values("date", kind="stable").reset_index(drop=True)
    assert len(rows) == len(upcoming), f"{len(rows)} predicted vs {len(upcoming)} upcoming"
    p_dc = dc.predict(rows)
    p_cat = cat.predict(rows)
    p_blend = blend_probs(p_dc, p_cat, BLEND_W)
    frames = []
    for i, row in rows.iterrows():
        top = _top5_from_grid(dc.scoreline_grid(row["home"], row["away"]).goal_matrix)
        frames.append({
            "season": row["season"], "date": row["date"], "home": row["home"],
            "away": row["away"],
            "p_dc_h": p_dc[i, 0], "p_dc_d": p_dc[i, 1], "p_dc_a": p_dc[i, 2],
            "p_cat_h": p_cat[i, 0], "p_cat_d": p_cat[i, 1], "p_cat_a": p_cat[i, 2],
            "p_blend_h": p_blend[i, 0], "p_blend_d": p_blend[i, 1], "p_blend_a": p_blend[i, 2],
            "top_home_goals": top.iloc[0]["home_goals"],
            "top_away_goals": top.iloc[0]["away_goals"],
            "top_prob": top.iloc[0]["prob"],
            "grid": np.asarray(dc.scoreline_grid(row["home"], row["away"]).goal_matrix, dtype=float).ravel().tolist(),
        })
    return pd.DataFrame(frames), dc, cat


def export_live(completed: pd.DataFrame) -> pd.DataFrame:
    upcoming = clean_fixtures(load_fixtures("SP1"), "SP1")
    upcoming = upcoming.sort_values("date", kind="stable").reset_index(drop=True)
    preds, dc, cat = predict_upcoming(completed, upcoming)
    preds["prediction_type"] = LIVE_TYPE
    preds.drop(columns=["grid"]).to_csv(WEBSITE_DIR / "upcoming_predictions.csv", index=False)

    tops = []
    for _, r in preds.iterrows():
        top = _top5_from_grid(r["grid"])
        top.insert(0, "season", r["season"])
        top.insert(1, "date", r["date"])
        top.insert(2, "home", r["home"])
        top.insert(3, "away", r["away"])
        tops.append(top)
    pd.concat(tops, ignore_index=True).to_csv(WEBSITE_DIR / "upcoming_scorelines_top5.csv", index=False)

    grid_out = preds[["season", "date", "home", "away", "grid"]].copy()
    grid_out.to_parquet(WEBSITE_DIR / "upcoming_scorelines.parquet", index=False)

    save_models(dc, cat)

    return preds


def main() -> None:
    WEBSITE_DIR.mkdir(parents=True, exist_ok=True)
    wide = export_test_predictions()
    export_test_scorelines()
    upcoming = export_live(build("SP1"))
    print(f"exported website artefacts to {WEBSITE_DIR}/ ({len(wide)} test rows)")
    print(f"live/forward predictions exported: {len(upcoming)} upcoming fixtures")


if __name__ == "__main__":
    main()
