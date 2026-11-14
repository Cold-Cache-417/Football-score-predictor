# Retrospective forecast feasibility

**Date:** 2026-11-14
**Status:** Investigation only. No predictions were generated, no ledger rows written,
no model artefact or historical forecast changed.
**Question:** can the 119 settled matches of 2026/27 (Matchweek 1–12) get a
*pre-kickoff* forecast without data leakage?

## Short answer

- **Features: reconstructable.** The feature builder already emits every row from
  state that stops before the match being predicted, so a walk-forward refit can
  produce honest pre-kickoff inputs.
- **Forecasts: not "original".** No pre-kickoff forecast for Matchweek 1–12 has
  ever existed for this season. Anything produced is a reconstruction and must be
  labelled as one, kept out of the immutable forecast ledger, and never shown as
  the site's live record.
- **The persisted live artefacts cannot be reused.** They are fitted on data that
  includes the matches they would be scoring.

## What the archive actually holds

| Fact | Evidence |
| --- | --- |
| 119 settled matches, all Matchweek 1–12 | `data/website/season_results.csv` (119 rows, `mw` 1–12) |
| 260 forecasts, none covering those matches | `data/website/upcoming_predictions.csv`: 260 rows dated 2026-11-22 → 2027-05-30, after the last settled match (2026-11-08); `data/calibra.db` `forecasts` = 260 |
| 119 results in the ledger, none joined to a forecast | `data/calibra.db` `results` = 119, `ledgerStats().settled` = 0 |
| Locked held-out metrics are a separate record | `reports/test_metrics_final.csv`, `test_predictions.csv` = 1,141 lines (1,140 matches) |

The gap is therefore structural, not a data loss: the project started recording
forecasts at Matchweek 13. There is no earlier forecast to recover.

## Why the features are point-in-time

`src/features.py` walks matches in date order and appends the feature row **before**
touching any state:

- `rows.append(feats)` at `src/features.py:149`
- unplayed fixtures `continue` immediately, leaving state untouched (`:151-152`)
- only then are history, Elo, Pi-ratings, xG history and rest days updated (`:154-171`)

`src/backtest.py:154` enforces the same boundary at the fold level:
`history = matches.iloc[: rows[0]]` — strictly earlier matches, never the week
being scored. A walk-forward refit is therefore leakage-free by construction,
not by convention.

## What leaks today

`src/export_website.py:127` fits the persisted artefacts with `live_fit(completed)`,
where `completed` includes the 119 played matches. Those two files —
`data/website/models/dixon_coles.pkl` and `catboost_model.cbm` — have already seen
the results they would be asked to "predict". Scoring Matchweek 1–12 with them
would be memorisation, not forecasting.

A retrospective must refit per matchweek (`run_backtest` already does this for the
locked evaluation), which is slower but sound.

## What is reconstructable, and what is not

| Input | Available for Matchweek 1–12? | Note |
| --- | --- | --- |
| Elo, Pi-ratings, form, rest days, promoted flags | Yes | Carried in from 2010/11 onward (`SP1_matches.parquet`, 6,199 rows, 17 seasons) |
| Matchweek 1 context | Partly | First week of a season has no current-season history; it relies on prior-season state, which is correct but noisier |
| xG features (4 of 23) | **No** | `XG_COLS` are optional (`src/features.py:50`); the training parquet has no xG columns and `src/understat.py` fails soft while Understat is unavailable |
| Closing odds | Yes, but not as a model input | Present for all 119 rows; methodology treats odds as a benchmark only |
| The bookmaker's own probability | Yes, as benchmark | `book_p_*` in the parquet, devigged |
| An original pre-kickoff forecast | **No** | Never recorded |

Feature count in the current artefacts: 21 numeric + 2 categorical = 23, of which
the 4 xG columns are absent.

## If this is approved later

1. Refit per matchweek with `run_backtest` semantics — never the persisted artefacts.
2. Write to a **separate** table or file, clearly marked `reconstructed`.
3. Leave `data/calibra.db`, `upcoming_predictions.csv`,
   `reports/test_metrics_final.csv` and `test_predictions.csv` untouched.
4. Rebuild the site's live record only from genuine ledger forecasts, so the
   reconstructed rows can never be mistaken for the real record.

## Risks

- **Presentation risk is the big one.** A reconstructed number looks identical to a
  real forecast. Without a visible label, the project would be claiming foresight it
  did not have.
- **Quality drift.** Refitting per week on smaller histories gives different numbers
  from the locked evaluation; that is expected and must not be read as a regression.
- **Promoted clubs** carry multi-season-stale ratings early in the season, so early
  reconstruction is the least trustworthy part.
- **Cost.** A per-matchweek refit is materially slower than one `live_fit`.
- **No way to validate against truth.** There is no original forecast to compare the
  reconstruction with; agreement with the locked backtest is the only sanity check.
