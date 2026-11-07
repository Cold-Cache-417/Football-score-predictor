"""Remove the bookmaker margin from 1X2 odds to get fair probabilities.

Two methods, both vectorized across matches:

- proportional: divide each implied probability by the booksum. The
  standard approach, slightly biased towards longshots.
- shin: Shin's method (1992/1993), which assumes part of the margin comes
  from informed bettors and redistributes it unevenly. The formulas follow
  penaltyblog's reference implementation (github.com/martineastwood/penaltyblog).
"""

from __future__ import annotations

import numpy as np


def booksum(odds: np.ndarray) -> np.ndarray:
    """The overround: sum of implied probabilities per match, > 1."""
    return (1.0 / odds).sum(axis=1)


def devig_proportional(odds: np.ndarray) -> np.ndarray:
    """Odds (n, 3) -> fair probabilities (n, 3), each row summing to 1."""
    p = 1.0 / odds
    return p / p.sum(axis=1, keepdims=True)


def devig_shin(odds: np.ndarray) -> np.ndarray:
    """Odds (n, 3) -> Shin fair probabilities (n, 3), rows sum to 1.

    For each match we solve for z in

        p_i(z) = (sqrt(z^2 + 4 * (1-z) * pi_i^2 / S) - z) / (2(1-z))

    where pi_i = 1/odds_i and S = sum(pi), such that sum_i p_i = 1.
    p(z) is monotone in z on (0, 1), so bisection is simple and robust.
    """
    pi = 1.0 / odds  # (n, 3)
    s = pi.sum(axis=1, keepdims=True)  # (n, 1)
    n = odds.shape[0]

    def probs_at(z: np.ndarray) -> np.ndarray:
        # z: (n, 1), pi: (n, 3) -> p: (n, 3)
        with np.errstate(divide="ignore", invalid="ignore"):
            p = (np.sqrt(z**2 + 4 * (1 - z) * pi**2 / s) - z) / (2 * (1 - z))
        return np.where(odds > 0, p, 1 / 3)

    lo = np.zeros(n)  # under-round edge case: z -> 0 gives back proportional
    hi = np.full(n, 1.0 - 1e-9)

    # Bisection: sum(p) is decreasing in z, so if the sum is still above 1
    # the root lies at a higher z (mid becomes the new lower bound).
    for _ in range(60):
        mid = np.clip((lo + hi) / 2, 1e-9, 1.0 - 1e-9)[:, None]
        p_sum = np.nan_to_num(probs_at(mid).sum(axis=1), nan=0.0)
        too_high = p_sum > 1.0
        lo = np.where(too_high, mid.ravel(), lo)
        hi = np.where(too_high, hi, mid.ravel())

    z = ((lo + hi) / 2)[:, None]
    return probs_at(z)
