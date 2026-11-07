"""Scoring metrics for 1X2 probability predictions.

Outcome order everywhere in this project: H=0, D=1, A=2 (RPS needs an
ordinal ordering: home < draw < away).
"""

from __future__ import annotations

import numpy as np

EPS = 1e-15


def rps(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Ranked probability score per match.

    p: (n, 3) predicted probabilities in outcome order (H, D, A).
    y: (n,) integer true outcomes.
    Lower is better; a perfectly calibrated forecast scores ~0.
    """
    p = np.clip(np.asarray(p, dtype=float), EPS, 1.0)
    p = p / p.sum(axis=1, keepdims=True)
    n_outcomes = p.shape[1]
    e = np.zeros_like(p)
    e[np.arange(len(y)), y] = 1.0
    cum_diff = np.cumsum(p, axis=1) - np.cumsum(e, axis=1)
    return (cum_diff**2).sum(axis=1) / (n_outcomes - 1)


def log_loss(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Per-match multinomial log loss (natural log). Lower is better."""
    p = np.clip(np.asarray(p, dtype=float), EPS, 1.0)
    return -np.log(p[np.arange(len(y)), y])


def accuracy(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Per-match indicator whether the argmax prediction was correct."""
    return (p.argmax(axis=1) == y).astype(float)


METRICS = {"RPS": rps, "log_loss": log_loss, "accuracy": accuracy}
# Lower is better for all except accuracy
DIRECTION = {"RPS": "lower", "log_loss": "lower", "accuracy": "higher"}


def avg_metrics(
    p: np.ndarray, y: np.ndarray, names: tuple[str, ...] = tuple(METRICS)
) -> dict[str, float]:
    out = {}
    for name in names:
        out[name] = float(METRICS[name](p, y).mean())
    return out


def _bootstrap_indices(n: int, n_boot: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, n, size=(n_boot, n))


def bootstrap_ci(metric: str, p: np.ndarray, y: np.ndarray, n_boot: int = 2000,
                 seed: int = 0) -> dict[str, float]:
    """Mean + 95% percentile interval of a metric by resampling matches."""
    scores = METRICS[metric](p, y)
    idx = _bootstrap_indices(len(y), n_boot, seed)
    means = scores[idx].mean(axis=1)
    return {
        "mean": float(scores.mean()),
        "lower": float(np.percentile(means, 2.5)),
        "upper": float(np.percentile(means, 97.5)),
    }


def paired_comparison(
    metric: str,
    p_a: np.ndarray,
    p_b: np.ndarray,
    y: np.ndarray,
    n_boot: int = 2000,
    seed: int = 0,
) -> dict[str, float]:
    """Bootstrap the (A - B) metric difference on the same resampled matches.

    Returns mean difference, 95% CI and P(A better than B) — the share of
    bootstrap samples where A has the better value (see DIRECTION).
    """
    idx = _bootstrap_indices(len(y), n_boot, seed)
    sa = METRICS[metric](p_a, y)[idx].mean(axis=1)
    sb = METRICS[metric](p_b, y)[idx].mean(axis=1)
    diff = sa - sb
    a_is_better = (diff < 0).mean() if DIRECTION[metric] == "lower" else (diff > 0).mean()
    return {
        "mean_diff": float(diff.mean()),
        "lower": float(np.percentile(diff, 2.5)),
        "upper": float(np.percentile(diff, 97.5)),
        "p_a_better": float(a_is_better),
    }
