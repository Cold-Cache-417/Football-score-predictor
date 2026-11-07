"""Blending Dixon-Coles and CatBoost probabilities."""

from __future__ import annotations

import numpy as np

from .metrics import METRICS


def blend_probs(p_dc: np.ndarray, p_cat: np.ndarray, w: float) -> np.ndarray:
    """Weighted average: p = w * CatBoost + (1 - w) * DixonColes."""
    p = w * p_cat + (1.0 - w) * p_dc
    p = p / p.sum(axis=1, keepdims=True)  # defensive; rows already sum to 1
    return p


def best_blend_weight(
    p_dc: np.ndarray, p_cat: np.ndarray, y: np.ndarray,
    grid: np.ndarray | None = None,
) -> dict[str, float]:
    """Pick w minimising validation RPS (log loss as tiebreak)."""
    if grid is None:
        grid = np.linspace(0, 1, 21)
    scores = []
    for w in grid:
        p = blend_probs(p_dc, p_cat, float(w))
        scores.append((
            float(METRICS["RPS"](p, y).mean()),
            float(METRICS["log_loss"](p, y).mean()),
            float(w),
        ))
    best = min(scores, key=lambda s: (s[0], s[1]))
    return {"w": best[2], "RPS": best[0], "log_loss": best[1]}
