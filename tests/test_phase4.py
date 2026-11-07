"""Tests for the DC + CatBoost blend (Phase 4)."""

from __future__ import annotations

import numpy as np

from src.blend import blend_probs, best_blend_weight


def test_blend_weight_boundaries():
    dc = np.array([[0.4, 0.3, 0.3]])
    cat = np.array([[0.6, 0.2, 0.2]])
    assert np.allclose(blend_probs(dc, cat, 0.0), dc)
    assert np.allclose(blend_probs(dc, cat, 1.0), cat)
    assert np.allclose(blend_probs(dc, cat, 0.5), [[0.5, 0.25, 0.25]])


def test_best_weight_recovers_the_better_ingredient():
    """If CatBoost is near-perfect and DC is flat, w must go to 1."""
    n = 400
    rng = np.random.default_rng(1)
    y = rng.integers(0, 3, n)
    cat = np.eye(3)[y] * 0.8 + 1 / 15  # rows sum to 1, near-perfect
    dc = np.full((n, 3), 1 / 3)
    out = best_blend_weight(dc, cat, y)
    assert out["w"] >= 0.9
    # the blend must be better than the flat DC input (RPS smaller = better)
    e = np.eye(3)[y]
    dc_rps = np.mean(((np.cumsum(dc, axis=1) - np.cumsum(e, axis=1))**2).sum(axis=1) / 2)
    assert out["RPS"] < dc_rps
