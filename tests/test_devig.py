"""Tests for the odds de-vigging."""

from __future__ import annotations

import numpy as np
import pytest

from src.devig import booksum, devig_proportional, devig_shin


@pytest.fixture
def odds() -> np.ndarray:
    return np.array([[2.7, 2.3, 4.4], [1.5, 4.0, 7.0], [2.05, 3.25, 3.9]])


def test_booksum_is_overround(odds):
    sums = booksum(odds)
    assert (sums > 1.0).all()
    assert np.allclose(sums, 1 / odds @ np.ones(3))


def test_proportional_sums_to_one(odds):
    probs = devig_proportional(odds)
    assert np.allclose(probs.sum(axis=1), 1.0)
    # proportional keeps ratios: 1/odds ratios must be preserved
    ratios_before = (1 / odds[0])[:2]
    ratios_after = probs[0][:2]
    assert np.allclose(ratios_before / ratios_after, ratios_before / ratios_after)


def test_shin_sums_to_one(odds):
    probs = devig_shin(odds)
    assert np.allclose(probs.sum(axis=1), 1.0, atol=1e-8)
    # Shin preserves the odds ranking (row 2 has a strong home favourite)
    assert probs[1][0] > probs[1][1] > probs[1][2]


def test_shin_is_more_unequal_than_proportional(odds):
    """Shin attributes relatively more margin to longshots, so the
    favourite prob is slightly higher and the underdog lower."""
    shin = devig_shin(odds)[1]  # strong home favourite row
    prop = devig_proportional(odds)[1]
    assert shin[0] > prop[0]
    assert shin[2] < prop[2]

def test_shin_matches_penaltyblog_reference(odds):
    """Cross-check against penaltyblog's row-wise implementation."""
    pb = pytest.importorskip("penaltyblog")
    reference = np.array(
        [pb.implied.calculate_implied(list(row), method="shin").probabilities for row in odds]
    )
    assert np.abs(devig_shin(odds) - reference).max() < 1e-9
