"""Gradient-boosting models over the pre-match features.

Both classes follow the Phase 2 model interface (fit on history,
predict a block of matches). Odds and any within-match statistic are
never inputs; features come exclusively from src/features.py, which is
computed strictly from earlier matches.

CatBoost takes team names as categorical features; XGBoost gets only
numeric features (team strength is already encoded via Elo/pi).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .features import CAT_COLS, FEATURE_COLS, XG_COLS


class CatBoostModel:
    def __init__(self, depth: int = 6, learning_rate: float = 0.1,
                 iterations: int = 300, l2_leaf_reg: float = 3.0,
                 with_xg: bool = False):
        self.params = dict(
            depth=depth, learning_rate=learning_rate, iterations=iterations,
            l2_leaf_reg=l2_leaf_reg,
        )
        self.with_xg = with_xg
        self.model = None

    def _cols(self, with_xg_included: bool) -> list[str]:
        cols = FEATURE_COLS + CAT_COLS
        if with_xg_included:
            cols = cols + XG_COLS
        return cols

    def fit(self, history: pd.DataFrame) -> "CatBoostModel":
        from catboost import CatBoostClassifier

        use_xg = self.with_xg and "xgf_home" in history.columns
        cols = self._cols(use_xg)
        self.model = CatBoostClassifier(
            loss_function="MultiClass", cat_features=CAT_COLS,
            random_seed=0, allow_writing_files=False,
            verbose=False, **self.params,
        )
        self.model.fit(history[cols], history["result"])
        self._cols_used = cols
        return self

    def predict(self, matches: pd.DataFrame) -> np.ndarray:
        # classes_ is [0, 1, 2] == our [H, D, A] order, no re-arranging needed
        return self.model.predict_proba(matches[self._cols_used])


class XGBoostModel:
    def __init__(self, depth: int = 5, learning_rate: float = 0.05,
                 n_estimators: int = 400, min_child_weight: float = 5.0,
                 with_xg: bool = False):
        self.params = dict(
            max_depth=depth, learning_rate=learning_rate,
            n_estimators=n_estimators, min_child_weight=min_child_weight,
        )
        self.with_xg = with_xg
        self.model = None

    def fit(self, history: pd.DataFrame) -> "XGBoostModel":
        from xgboost import XGBClassifier

        use_xg = self.with_xg and "xgf_home" in history.columns
        cols = [c for c in FEATURE_COLS + XG_COLS
                if use_xg or c not in XG_COLS]
        self.model = XGBClassifier(
            objective="multi:softprob", num_class=3,
            tree_method="hist", random_state=0, verbosity=0,
            eval_metric="mlogloss", **self.params,
        )
        self.model.fit(history[cols], history["result"])
        self._cols_used = cols
        return self

    def predict(self, matches: pd.DataFrame) -> np.ndarray:
        return self.model.predict_proba(matches[self._cols_used])
