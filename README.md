# La Liga Football Score Predictor

Predict Spanish La Liga matches as calibrated probabilities (home / draw / away)
and likely scorelines, then measure how close the models get to the bookmaker
odds. The goal is calibration (RPS, log loss), not raw accuracy.

Data and modelling are phased:

| Phase | Status | What it does |
|---|---|---|
| 1 — Data | **done** | Download La Liga results + odds, clean, de-vig |
| 2 — Baselines | **done** | Dixon-Coles + dumb baselines, walk-forward backtest |
| 3 — ML upgrade | **done** | Elo / pi-ratings / form features, CatBoost vs XGBoost |
| 4 — Blend | **done** | Blend DC + CatBoost, compare vs market |
| 4.5 — Live predictions | **done** | Refit on all completed matches → predict upcoming fixtures, export artefacts |
| 5 — App | **skipped** | Static artefacts exported instead of a Streamlit app |

## Setup

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run Phase 1 (build the dataset)

```bash
.venv/bin/python -m src.build_dataset          # download once, then cached
.venv/bin/python -m src.build_dataset --refresh  # force re-download
```

Output: `data/processed/SP1_matches.parquet` — one row per match:

| column | meaning |
|---|---|
| `date`, `season`, `matchday` | when |
| `home`, `away` | canonical team names |
| `fthg`, `ftag`, `result` | full-time goals, result (0=H, 1=D, 2=A) |
| `odds_h`, `odds_d`, `odds_a`, `odds_source` | best available 1X2 odds |
| `book_p_h`, `book_p_d`, `book_p_a` | de-vigged fair probabilities |

## Tests

```bash
.venv/bin/python -m pytest tests -q
```

## Data source

Results and odds come from [football-data.co.uk](https://www.football-data.co.uk),
16 seasons of La Liga (2010/11 – 2025/26), cached as raw CSVs in `data/raw/`.

- Odds preference: **Pinnacle closing** (`PSC*`, available from 2012/13) →
  Pinnacle opening → Bet365 closing → Bet365 → market average. Verified
  coverage: 84% Pinnacle closing, 16% Bet365 fallback, 0 missing.
- Bookmaker margin (mean 2.5%) is removed by normalizing implied
  probabilities (`proportional` method; a vectorized `shin` method is also
  implemented and validated against the penaltyblog reference).
- Team names differ slightly across sources; `TEAM_ALIASES` in `src/config.py`
  maps every spelling observed in the raw files to one canonical name.
- Season assignment handles the COVID-19 delayed finish of 2019/20 via
  `SEASON_OVERRIDES` in `src/config.py`.

## Run Phase 2 (baselines + walk-forward backtest)

```bash
.venv/bin/python -m src.build_dataset   # if not already built
.venv/bin/python -m src.run_phase2
```

Writes predictions (`data/processed/backtest_predictions.parquet`) and
reports (`reports/`: xi tuning, test metrics, paired tests, per-season
metrics, calibration plot).

**Backtest protocol** (all models predict the exact same matches):

| period | seasons | use |
|---|---|---|
| burn-in | 2010/11 – 2013/14 | history only, never scored |
| validation | 2014/15 – 2022/23 | tuning the DC time-decay (xi) |
| locked test | 2023/24 – 2025/26 | one evaluation at the end |

- Refits happen once per matchweek (a new matchweek starts at a date gap
  ≥ 4 days, restart per season), on matches strictly before the week —
  never per match, never on any same-week data.
- Model inputs contain no odds and no stats of the match being predicted.
- xi (time decay) selected on validation only: **0.001** (RPS grid:
  0 → 0.008).
- Uncertainty: 2000-replicate bootstrap; paired comparisons resample the
  same matches for both models (P(A better) = share of samples where A wins).

## Results (Phase 2, locked test = 2023/24–2025/26, 1140 matches)

| model | RPS (lower better) | log loss | accuracy |
|---|---|---|---|
| Bookmaker de-vigged (benchmark) | **0.1888** (CI 0.1816–0.1957) | **0.9541** | **55.3%** |
| Dixon-Coles, xi=0.001 | 0.1941 (CI 0.1868–0.2013) | 0.9703 | 53.1% |
| Base rates | 0.2253 (CI 0.2203–0.2303) | 1.0655 | 45.8% |

Paired comparisons (sorted: model beats Dixon-Coles; DC beats base rates)
show the gaps are **not** noise: every metric difference has a bootstrap
CI excluding zero. Honest verdict: **the model does not beat the market**
(Market RPS diff −0.0053 vs DC, CI −0.0082…−0.0022, P(market better) = 1.0),
but it is a large improvement over the naive baseline and stays within a
few points of Pinnacle-calibrated odds, per season (RPS by season table in
`reports/per_season_metrics.csv`). Calibration plot: `reports/calibration.png`.

## Run Phase 3 (ML upgrade)

```bash
brew install libomp                        # xgboost needs OpenMP on macOS
.venv/bin/python -m src.run_phase3         # tunes on validation, then evaluates
.venv/bin/python -m src.run_phase3 --with-xg   # adds Understat xG features if cached
```

**Pre-match features** (`src/features.py`, built in one chronological pass;
a row's own result is fed into the state only *after* its features are
emitted — unit-tested for leakage):
Elo ratings (penaltyblog), pi-ratings (Constantinou, penaltyblog),
last-6 form (points / goals for / against, plus venue-specific points
rate), rest days (capped at 30), matches played, and explicit
promoted-team flags (not in the previous season's first division; all
their rate features are NaN, handled natively by the boosters).

- CatBoost uses team names as categorical features; XGBoost uses the
  numeric features only (strength is already encoded via ratings).
- Tuning: expanding-window validation (2014/15–2022/23), one fit per
  season, no random CV. Grid: depth {4,6} × learning rate {0.05, 0.1}.
  The locked test period is not used until the one final evaluation.
- Optional xG (Understat): switchable via `--with-xg`; the fetcher in
  `src/understat.py` caches understat.com season pages and fails soft —
  the site was offline at build time, so results here are without xG.

## Results (Phase 3, locked test = 2023/24–2025/26, 1140 matches)

| model | RPS ↓ | log loss ↓ | accuracy |
|---|---|---|---|
| Bookmaker de-vigged (benchmark) | **0.1888** | **0.9541** | **55.3%** |
| CatBoost (tuned: depth 4, lr 0.05) | 0.1933 | 0.9675 | 53.9% |
| Dixon-Coles, xi=0.001 | 0.1941 | 0.9703 | 53.1% |
| XGBoost (tuned: depth 4, lr 0.05) | 0.2010 | 1.0003 | 51.9% |
| Base rates | 0.2253 | 1.0655 | 45.8% |

- CatBoost vs Dixon-Coles: paired−Δ RPS −0.0008 (CI −0.0035…0.0021) —
  **statistically indistinguishable**; the feature-rich model gained a
  hair of log loss but nothing you can bank on.
- XGBoost was clearly worse on validation *and* test; honest note: it is
  the odd one out, possibly underfit with our numeric-only inputs.
- The market still beats every model (paired bootstrap, P ≈ 0.99–1.0).
- **2025/26 benchmark caveat:** the bookmaker odds switch from Pinnacle
  to Bet365 from 15 Dec 2025. Restricted to that season, the benchmark
  scores RPS 0.1864 on Pinnacle rows (n=189) vs 0.2052 on Bet365 rows
  (n=191); the models score ≈0.19/0.21 on the same two substrata — the
  market-vs-model conclusion does **not** hinge on the odds-source mix.

## Results (Phase 1 dataset)

```
=== La Liga dataset ===
matches: 6189  seasons: 17  dates: 2010-08-28 to 2026-11-02

Odds source coverage:
Pinnacle closing 0.830 / Bet365 opening 0.123 / Bet365 closing 0.048

Bookmaker margin: mean 1.0306, median 1.0247

Outcome frequencies vs mean de-vigged book probabilities:
  home: freq 0.466  book 0.456
  draw: freq 0.250  book 0.253
  away: freq 0.283  book 0.291
```

(The current season, 2026/27, was added in Phase 4.5: the results file
`SP1_2627.csv` now covers matches played up to 2026-11-02, and the league
was extended in `src/config.LEAGUES`.)

Sanity check: frequencies and book probabilities line up within ~1pp over
6000 matches, so the de-vig is reasonable.

## Run Phase 4 (blend, single test evaluation)

```bash
.venv/bin/python -m src.run_phase4        # tune w on validation, evaluate once on test
```

The blend weight comes from the saved per-matchweek validation predictions
(phase 3 outputs) — no new fits were run.

## Phase 4 results (locked test = 2023/24–2025/26, 1140 matches)

Blend weight selected on validation: **w = 0.35** (DC weight 0.65, CatBoost 0.35).

| blend vs | RPS mean(A-B) | CI (A-B) | P(A better) |
|---|---|---|---|
| Dixon-Coles | −0.00114 | [−0.00206, −0.00022] | **0.992** |
| CatBoost | −0.00035 | [−0.00211, +0.00136] | 0.646 |
| Bookmaker | +0.00416 | [0.00132, 0.00708] | 0.001 |

Test-period final metrics (mean):

| model | RPS ↓ | log loss ↓ | accuracy |
|---|---|---|---|
| Bookmaker de-vigged | **0.1888** | **0.9541** | **55.3%** |
| Blend (DC + CatBoost) | 0.1929 | 0.9661 | 53.3% |
| CatBoost (tuned) | 0.1933 | 0.9675 | 53.9% |
| Dixon-Coles (time decay) | 0.1941 | 0.9703 | 53.1% |

**Honest verdict:** blending bought a **significant** improvement over
Dixon-Coles (P=0.992, ΔRPS −0.00114), but the blended ensemble is still
**behind the bookmaker by ΔRPS +0.00416** (P=0.001 that the model beats the
market) and statistically tied with CatBoost. The blend is not the answer
the market is giving — consistent with Phases 2 and 3.

## Phase 5 was skipped — static website artefacts instead

`.venv/bin/python -m src.export_website` produces:

| artefact | path |
|---|---|
| test-period predictions (H/D/A per model + blend, book probs/odds, source) | `data/website/test_predictions.csv` |
| full Dixon-Coles scoreline grids (15×15 per test match, walk-forward) | `data/website/test_scorelines.parquet` |
| top-5 scorelines per test match | `data/website/test_scorelines_top5.csv` |
| live/forward fixture predictions (Phase 4.5, blend w=0.35 fixed) | `data/website/upcoming_predictions.csv`, `upcoming_scorelines_top5.csv`, `upcoming_scorelines.parquet` |
| fitted models (website / API layer consumes these, no refit) | `data/website/models/dixon_coles.pkl`, `data/website/models/catboost_model.cbm` |

Model comparison / per-season / calibration artifacts are in `reports/`
(`test_metrics_final.csv`, `per_season_metrics_final.csv`,
`calibration_all.png`, `paired_tests_final.csv`, `blend_weight_tuning.csv`,
`bookmaker_segments.csv`).

Full file / column / probability semantics for every artefact:
**`DATA_CONTRACT.md`**.

### Run Phase 4.5 (live forward predictions)

```bash
.venv/bin/python -m src.export_website
```

Phase 4.5 refits Dixon-Coles (xi = 0.001) and CatBoost (depth 4, lr 0.05) on
**all completed matches up to today** (dataset now spans the current season
2026/27 through 2026-11-02; 6189 matches total), keeps the Phase 4 blend
weight fixed at **w = 0.35** (not re-tuned), and predicts the upcoming
fixtures from the football-data.co.uk fixtures file
(`Div = SP1`, no results yet).

### Live predictions — current upcoming fixtures (La Liga 2026/27, unplayed)

Source: [football-data.co.uk/fixtures.csv](https://www.football-data.co.uk)
(cached `data/raw/fixtures.csv`; verified live — the file publishes upcoming
fixtures for all leagues and is filtered to `SP1` here). All 10 currently
listed SP1 fixtures are unplayed.

| date | home | away | P(home) | P(draw) | P(away) | blend P(H/D/A) | top score (prob) |
|---|---|---|---|---|---|---|---|
| 2026-11-06 | Sevilla | Deportivo Alaves | 0.516 | 0.260 | 0.224 | 0.516 / 0.260 / 0.224 | 1-1 (0.123) |
| 2026-11-07 | Malaga | Racing Santander | 0.477 | 0.256 | 0.268 | 0.477 / 0.256 / 0.268 | 1-1 (0.102) |
| 2026-11-07 | Espanyol | Deportivo La Coruna | 0.453 | 0.288 | 0.259 | 0.453 / 0.288 / 0.259 | 1-1 (0.128) |
| 2026-11-07 | Osasuna | Athletic Bilbao | 0.341 | 0.278 | 0.381 | 0.341 / 0.278 / 0.381 | 1-1 (0.136) |
| 2026-11-07 | Valencia | Real Madrid | 0.185 | 0.197 | 0.618 | 0.185 / 0.197 / 0.618 | 0-1 (0.118) |
| 2026-11-08 | Elche | Real Betis | 0.308 | 0.276 | 0.416 | 0.308 / 0.276 / 0.416 | 1-1 (0.125) |
| 2026-11-08 | Real Sociedad | Rayo Vallecano | 0.517 | 0.264 | 0.219 | 0.517 / 0.264 / 0.219 | 1-0 (0.127) |
| 2026-11-08 | Celta Vigo | Levante | 0.523 | 0.247 | 0.229 | 0.523 / 0.247 / 0.229 | 1-1 (0.108) |
| 2026-11-08 | Villarreal | Getafe | 0.585 | 0.233 | 0.182 | 0.585 / 0.233 / 0.182 | 1-0 (0.147) |
| 2026-11-08 | Atletico Madrid | Barcelona | 0.331 | 0.208 | 0.462 | 0.331 / 0.208 / 0.462 | 1-1 (0.112) |

These are forward predictions from a model fitted on matches through
2026-11-02; they are **not** backtest rows and must not be scored against
results.

### Upcoming fixtures status

The earlier "empty upcoming" state was an artefact of reading the *results*
file for the current season; it now has no unplayed rows. The correct source
(fetched live on 2026-11-07) is the **fixtures** file, which lists the
upcoming schedule; Phase 4.5 predictions are now exported from it.

## Adding a new league

Add the football-data league code (e.g. `D1` for Bundesliga, `E0` for Premier League)
 in `src/config.py` under `LEAGUES`, with its seasons, and add a team alias
 mapping if the new league uses different spellings. Everything else
 (download, clean, de-vig, modelling) is league-agnostic.
