"""Favourite-label threshold contract (40%).

Run:  pytest tests/test_label_threshold.py -q

The label is a display rule, not a model rule: it must read the same top
probability the rest of the page uses, and must never invent a favourite
when the race is still open.
"""

import os
import socket
import subprocess
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 4197
BASE = f"http://127.0.0.1:{PORT}"


def _port_open(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", PORT)) == 0:
                return True
        time.sleep(0.2)
    return False


@pytest.fixture(scope="module")
def server():
    env = {**os.environ, "PORT": str(PORT), "HOST": "127.0.0.1", "RESULTS_REFRESH_MIN": "0"}
    proc = subprocess.Popen(
        ["node", "server/index.mjs"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not _port_open():
        proc.kill()
        pytest.fail("server did not start")
    yield BASE
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope="module")
def page(server):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        pg = ctx.new_page()
        pg.goto(f"{BASE}/fixtures.html", wait_until="domcontentloaded")
        pg.wait_for_function(
            "() => window.CALIBRA && typeof window.CALIBRA.pickLabel === 'function'",
            timeout=15000,
        )
        yield pg
        browser.close()


def label(page, key, value):
    return page.evaluate(
        "([key, value]) => window.CALIBRA.pickLabel({}, { key: key, value: value })",
        [key, value],
    )


@pytest.mark.parametrize("key,value,expected", [
    ("H", 0.55, "Home favourite"),
    ("D", 0.45, "Draw favourite"),
    ("A", 0.62, "Away favourite"),
    ("H", 1.0, "Home favourite"),
])
def test_threshold_met_labels_the_leading_outcome(page, key, value, expected):
    assert label(page, key, value) == expected


@pytest.mark.parametrize("key,value", [
    ("H", 0.3999),
    ("D", 0.35),
    ("A", 0.0),
])
def test_below_threshold_is_too_close_to_call(page, key, value):
    assert label(page, key, value) == "Too close to call"


@pytest.mark.parametrize("key", ["H", "D", "A"])
def test_exact_40_percent_is_a_favourite(page, key):
    assert label(page, key, 0.40) == f"{'Home' if key == 'H' else 'Draw' if key == 'D' else 'Away'} favourite"


def test_threshold_constant_is_40_percent(page):
    assert page.evaluate("window.CALIBRA.FAVOURITE_MIN") == pytest.approx(0.4)


def test_missing_pick_is_not_labelled_a_favourite(page):
    assert page.evaluate("window.CALIBRA.pickLabel({}, null)") == "No forecast"


def test_tie_below_threshold_stays_unlabelled(page):
    # Equal 35% leaders: the tie-break picks home, but 35% is not a favourite.
    result = page.evaluate(
        """() => {
          const p = { h: 0.35, d: 0.35, a: 0.30 };
          const pick = { key: 'H', value: p.h };
          return { label: window.CALIBRA.pickLabel({}, pick), value: pick.value };
        }"""
    )
    assert result == {"label": "Too close to call", "value": 0.35}


def test_tie_at_threshold_follows_documented_tie_break(page):
    # Home wins an exact tie in `favourite()`, so the same 40% reads as a favourite.
    result = page.evaluate(
        """() => {
          const pick = { key: 'H', value: 0.40 };
          return window.CALIBRA.pickLabel({}, pick);
        }"""
    )
    assert result == "Home favourite"


def test_label_uses_the_top_probability_and_nothing_else(page):
    report = page.evaluate(
        """() => {
          const C = window.CALIBRA;
          let checked = 0;
          const bad = [];
          C.fixtures.forEach((fixture) => {
            const p = C.forecastProbabilities(fixture);
            const pick = C.favourite(fixture);
            if (!p || !pick) return;
            checked += 1;
            const top = Math.max(p.h, p.d, p.a);
            const expectedKey = top === p.h ? 'H' : top === p.a ? 'A' : 'D';
            if (Math.abs(pick.value - top) > 1e-12) bad.push({ id: fixture.id, why: 'value' });
            if (pick.key !== expectedKey) bad.push({ id: fixture.id, why: 'key' });
            const label = C.pickLabel(fixture, pick);
            const wanted = top >= 0.4
              ? (pick.key === 'H' ? 'Home favourite' : pick.key === 'A' ? 'Away favourite' : 'Draw favourite')
              : 'Too close to call';
            if (label !== wanted) bad.push({ id: fixture.id, why: 'label', label, wanted });
          });
          return { checked, bad: bad.slice(0, 5) };
        }"""
    )
    assert report["checked"] > 300
    assert report["bad"] == []
