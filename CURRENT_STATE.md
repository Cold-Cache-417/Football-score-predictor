# CURRENT_STATE — verified state of the project

Last full verification: **2026-11-12** (static site `web/`), and **2026-11-07**
for the legacy Next.js record below.

---

## 0. Current: `web/` static site (live pipeline data)

`web/` is the main site (vanilla HTML/CSS/JS). The old Next.js site is
preserved untouched in `web-classic/`. Everything below was verified in a real
browser (Chromium via Playwright) against `python3 -m http.server 4173`,
fresh loads, 0 console errors on all 7 pages.

**All data is real. No mock fixtures are rendered anywhere.**

- **Forecasts**: `data/website/upcoming_predictions.csv` — 9 La Liga fixtures,
  Matchweek 12 (Nov 7–8, 2026), blend + Dixon-Coles + CatBoost probabilities
  and the top scoreline per match.
- **Results**: `data/website/season_results.csv` — 109 real 2026/27 matches
  (Matchweeks 1–11) exported from `data/raw/SP1_2627.csv`
  (football-data.co.uk) by `scripts/export_site_data.py`: real scores, real
  match xG, real B365 closing odds, honest matchweek numbers.
- **Standings / form**: computed in-browser from the real results
  (`web/assets/js/app.js`, `applyLiveOverride()`).
- **Metrics**: `reports/test_metrics_final.csv` +
  `reports/per_season_metrics_final.csv` — blend RPS 0.193 vs market 0.189,
  log loss 0.966, accuracy 53.3%; per-season record 2014/15 → 2025/26.

Page by page:

| Page | What it shows |
|---|---|
| Home | Next forecast (Málaga–Racing Santander), real results grid, real standings + form, per-season RPS chart |
| Fixtures | 118 real fixtures (109 settled + 9 forecast), working search/filters, MW options rebuilt from data, kickoff times "TBC" where the export has none |
| Match (upcoming) | Blend 1X2, top scoreline, DC/Cat disagreement, real standings comparison |
| Match (settled) | Final score, real match xG, de-vigged closing market labelled as reference (never as a model forecast) |
| Models | Real per-model RPS/log loss/accuracy/calibration |
| Performance | Real held-out metrics, per-season chart, calibration, weak spots |
| About / Creator | Copy updated to describe the live pipeline honestly |

Team registry now matches the real 2026/27 roster (Málaga, Racing Santander,
Deportivo La Coruña added; Girona/Mallorca/Oviedo removed). The three new
teams use `assets/crests/generic.svg`.

Script tags carry `?v=2` cache-busting. If a page ever looks stale,
hard-refresh once — the version key forces a re-fetch.

Re-run the results export with: `python3 scripts/export_site_data.py`
(stdlib only; the forecast export needs `.venv/bin/python src/export_website.py`).

---

## 1. Legacy record — Next.js site (now `web-classic/`)

Previous full verification: **2026-11-07**, on the Home hero checkpoint.
Everything below was checked against the running app at the time, not inferred from code.

---

## 1. Summary

| Layer | Verdict |
|---|---|
| Dataset | ✅ 6,189 matches, 17 seasons, through 2026-11-02 |
| Backtest exports | ✅ 1,140 rows, schema matches `DATA_CONTRACT.md` |
| Upcoming exports | ⚠️ 4 of 7 documented artefacts (see §4) |
| Model pickles | ❌ missing, `data/website/models/` empty (not needed yet) |
| Next.js build | ✅ `tsc --noEmit` and `npm run build` both exit 0 |
| Home hero | ✅ implemented, verified, fits 1440×900 and 390×844 |
| Other pages | ❌ not built (out of scope until approval) |
| FastAPI | ❌ not built |
| Git | ✅ initialised, baseline commit exists |
| Crests | ✅ 35 real Wikimedia crests with a licence registry |

## 2. Verification results (measured, not claimed)

Run against `next dev` on http://127.0.0.1:3000 with Chrome 155 via Playwright.

| Check | Desktop 1440×900 | Mobile 390×844 | Reduced motion |
|---|---|---|---|
| React hydrated | ✅ true | ✅ true | ✅ true |
| Horizontal overflow | 0 px | 0 px | 0 px |
| Document height | 900 px (exact fit) | 844 px (exact fit) | 900 px |
| Crest images loaded | ✅ 2/2 (`naturalWidth` 83) | ✅ 2/2 | ✅ 2/2 |
| Split bar widths | 486 / 308 / 278 px | 159 / 101 / 91 px | 486 / 308 / 278 px |
| Cursor light `--glow-x` | ✅ 57.76% | n/a (no pointer) | ✅ not set (disabled) |
| Console errors | 0 | 0 | 0 |
| Failed requests | 0 | 0 | 0 |

Screenshots: `design-check/hero-desktop.png`, `hero-mobile.png`,
`hero-reduced-motion.png`.

## 3. The hero, as built

- **Data**: `data/website/upcoming_predictions.csv` joined to
  `data/raw/fixtures.csv` on (date, home, away) to recover the kickoff time
  that `clean_fixtures` drops.
- **Selection**: kickoff wall-clock time is interpreted as Europe/Madrid,
  converted to an absolute instant (two-pass DST-safe offset), and compared
  with the current time. Only a fixture that has **not yet started** can be
  shown. Sorted by kickoff, earliest wins.
- **Empty state**: if every exported fixture has started, the hero says so and
  tells the user to re-run the export. It never falls back to a past match.
- **Snapshot label**: the hero shows the CSV's file mtime ("7 Nov 2026,
  12:22 CET"), so the staleness of the data is visible rather than implied.
- **Numbers**: blend H/D/A from `p_blend_*`; exact score and its probability
  from `top_home_goals`/`top_away_goals`/`top_prob` (Dixon-Coles grid maximum);
  the `DC … · CB …` sub-line comes from `p_dc_*` and `p_cat_*`.
- **Honesty line**: the footer states the blend composition, that the scoreline
  is Dixon-Coles alone, and that RPS 0.1929 loses to the bookmaker's 0.1888.

Verified values at check time — fixture **Espanyol vs Deportivo La Coruña**,
Sat 7 Nov 2026 15:15 CET:

| Item | Value | Source column |
|---|---|---|
| Most likely score | 1–1 | `top_home_goals`, `top_away_goals` |
| P(exact score) | 12.8% | `top_prob` = 0.128445 |
| P(home) | 45.3% | `p_blend_h` = 0.452987 |
| P(draw) | 28.8% | `p_blend_d` = 0.287552 |
| P(away) | 25.9% | `p_blend_c` → `p_blend_a` = 0.259461 |
| Dixon-Coles | 43.2 / 27.0 / 29.8 | `p_dc_*` |
| CatBoost | 49.1 / 32.0 / 18.8 | `p_cat_*` |

Why not Málaga vs Racing Santander (13:00)? Because at 13:26 CET that match
had already kicked off, so it was correctly skipped. This is the fixture
filter working, not a bug. Earlier in the day the same code selects Málaga.

## 4. Exports: what is missing and whether it matters

`DATA_CONTRACT.md` documents seven website artefacts. Present: the four CSV /
parquet files under `data/website/`. Absent: `upcoming_scorelines_top5.csv`,
`upcoming_scorelines.parquet`, and both model pickles.

**Cause (inferred from `src/export_website.py`, not proven):** `export_live()`
writes in this order — `upcoming_predictions.csv`, then the top-5 CSV, then the
grid parquet, then `save_models()`. The file timestamps (models directory
14:19, predictions 14:22) are consistent with runs that stopped partway
through that sequence.

**Do they block the website? No.** Verified by what the site actually reads:

- The hero needs H/D/A, the top scoreline and its probability — all present as
  scalar columns in `upcoming_predictions.csv`.
- The model pickles are only needed by a server that loads models to predict.
  The agreed architecture is that FastAPI serves exported files only and must
  not refit or re-predict, so it does not need them.
- The upcoming 15×15 grid is only needed for a per-match scoreline heatmap,
  which belongs to the future match-detail page.

They are a **contract gap** to close before the match-detail page, not a
blocker for the hero. Closing it means re-running `python -m src.export_website`,
which refits Dixon-Coles and CatBoost — deliberately **not** done here.

## 5. Problems found and fixed during this checkpoint

| # | Problem | Cause | Status |
|---|---|---|---|
| 1 | `npm run build` failed | `page.tsx` imported a named `Hero` that only had a default export; `ui/progress.tsx` used an undeclared prop | Fixed |
| 2 | Hero could show a match that had already kicked off | `nextUpcomingFixture()` sorted by date and never compared to now | Fixed — kickoff instant + Europe/Madrid, only future fixtures |
| 3 | `next dev` page never hydrating | Next 16 blocks cross-origin dev resources; HMR socket from `127.0.0.1` rejected | Fixed — `allowedDevOrigins: ["127.0.0.1"]` |
| 4 | Split bar rendered 0 px wide | Framer Motion never applied the animated `width` | Fixed — flex-basis segments + CSS `scaleX` reveal |
| 5 | Cursor light did nothing | Consequence of #3 (no hydration) | Fixed and measured |
| 6 | Whole hero re-rendered on every `mousemove` | `setState` per pointer event | Fixed — one rAF loop writing CSS vars |
| 7 | Crests invisible | No crest assets existed at all; `TeamCrest` had no image path | Fixed — 35 real crests + registry + initials fallback |
| 8 | "LIVE" badge implied real-time data | Static label | Fixed — removed; snapshot time shown instead |
| 9 | Content overflowed below 900 px | `justify-between` with four rows and no fixed shell | Fixed — flex shell, measured exactly 900 px |
| 10 | Light-theme tokens contradicted "dark only" | Leftover `@theme` entries | Fixed — removed |

## 6. Known remaining issues

1. **`RippleGrid.tsx` is now unused.** It is 330 lines of WebGL2 that nothing
   imports; the atmospheric background is CSS only. Kept in the repo pending a
   decision, not wired up.
2. **Unused dependencies.** `framer-motion`, `gsap`, `lenis` and `lucide-react`
   are installed but no longer imported anywhere. Left in place; removing them
   is a separate decision.
3. **Crest licensing.** 31 of 35 crests are "Fair use" non-free logos, 4 are
   public domain. Fine for a private local project; publishing would need a
   licensing review. Recorded per club in `web/src/lib/crest-registry.json`.
4. **Snapshot goes empty.** After 2026-11-08 20:00 CET all nine exported
   fixtures will have started, so the hero will show the empty state until
   `src.export_website` is re-run. That is intended behaviour.
5. **`README.md`'s live fixture table** is stale (lists 10 fixtures including
   the 11-06 match). Not corrected, because it documents a past export run.
6. **`DESIGN.md`** still describes Ripple Grid as the hero background; the
   implemented design uses a CSS grid and cursor light instead.

## 7. Deliberately not done

Fixtures page, match detail page, models page, FastAPI, calibration chart,
per-season comparisons, GSAP/Lenis scroll scenes, full accessibility audit,
Lighthouse, deployment. The modelling pipeline and exported data were not
modified.

---

## UPDATE 2026-11-07 — full website

All six routes are built and verified in a real browser (Chrome 155 via
Playwright), desktop 1440×900 and mobile 390×844.

| Route | Kind | Content |
|---|---|---|
| `/` | partial prerender | existing hero + "also in this snapshot" strip + real nav |
| `/fixtures` | dynamic | 9 exported fixtures, day filter, 4 sort modes, crests, top score, H/D/A |
| `/match/[slug]` | dynamic | upcoming: blend, DC/CB, top score, honest "grid not exported" state. Historical: full 15×15 grid, top-5, actual result, per-model RPS |
| `/models` | static | Dixon-Coles, CatBoost features, 65/35 blend, full weight sweep, test metrics |
| `/performance` | static | metrics vs market, calibration curve, per-season RPS, paired bootstrap, odds segments, sample matches |
| `/about` | static | data, protocol, metrics, limits, disclaimer |

Verified: `tsc --noEmit` 0, `npm run build` 0, 0 console errors, 0 failed
requests, 0 horizontal overflow at 390px, 9 fixture rows, all 18 crests
loaded, sorting and day filtering change the rendered list. Values were
asserted against the CSVs (Espanyol 45.3/28.8/25.9, historical Villarreal
40.6/24.8/34.6, market 0.1888 vs blend 0.1929).

### New derived artefact

`data/website/test_scorelines_grid.json` — a read-only view of the existing
`test_scorelines.parquet`: 1,140 matches, all 225 cells each, at the parquet's
exact float precision, 5.5 MB. Verified cell-for-cell against the parquet:
0 values altered, 0 missing, per-match sums identical (max diff 0.0). It exists
only because the web layer cannot read parquet. It is **not** a model output
and was not produced by re-running the pipeline.

An earlier draft dropped cells below 0.0005 and rounded to 6 decimals. That
retained only 99.69% of mass on average (worst 99.465%), i.e. the heatmaps were
truncated, and it altered ~38.9k cells by <1e-6. Both were unacceptable, so the
file was regenerated complete and exact. The heatmap is now complete, never
renormalised; opacity is relative to each match's most likely scoreline.

### Still missing / still blocked

- `upcoming_scorelines.parquet` + `upcoming_scorelines_top5.csv`: the reason
  upcoming match pages cannot draw a grid. Re-running `src.export_website`
  would produce them but refits both models — awaiting approval.
- Model pickles still absent; unused by the website.
- Snapshot expires after 2026-11-08; pages then show started fixtures and the
  hero shows its empty state.

---

# 2026-11-12 — Concept becomes the product (Freebuff integration)

Everything above this line describes the previous Next.js site (`web-classic/`).
It is kept for reference and is no longer the deployed frontend.

## What the site is now

- `web/` — the former `concept/` prototype, now the real frontend (7 pages).
- `web-classic/` — the old Next.js app, untouched, kept as reference.
- `server/` — zero-dependency Node service: static files + JSON API + results refresh.
- `data/`, `reports/` — pipeline artefacts, served read-only under `/data` and `/reports`.

## Data flow

`data/raw/SP1_2627.csv` + `data/raw/schedule_2627.json`
→ `scripts/refresh_pipeline.py --results --fixtures --site --predict`
→ `data/website/season_results.csv`, `data/raw/fixtures.csv`, `data/website/upcoming_predictions.csv`
→ `server/lib/data.mjs` (`buildPayload`) merges results, forecasts, schedule and the live feed
→ `/api/bootstrap.js` (blocking first paint) and `/api/fixtures` (polling)
→ `web/assets/js/data-live.js` → `web/assets/js/app.js` renders the 7 pages.

Standings, form, metrics, calibration and model comparison are derived server-side only.

## Sources

| data | source | notes |
| --- | --- | --- |
| Results + closing odds | football-data.co.uk `SP1_2627.csv` | next-day update; 119 played matches through MW12 |
| Calendar | openfootball `2026-27/es.1.json` | 380 fixtures; many kick-off times TBC |
| Live + same-day results | API-Football | free plan: 100 req/day, `live=all` + `date=today±1`, no 2026 season |
| Forecasts | project pipeline (`export_live`) | 260 forecasts, MW13–38, methodology unchanged |

## Run

```sh
PORT=4173 node server/index.mjs           # http://127.0.0.1:4173/
node scripts/check_site_data.mjs          # payload invariants
.venv/bin/python -m pytest tests -q       # 34 pipeline tests
```

## Model status

Untouched. Dixon-Coles (xi=0.001) × CatBoost, fixed 65/35 blend, market as
benchmark only, same walk-forward evaluation. Held-out numbers served by the API:
blend RPS 0.19293 vs market 0.18877, log loss 0.96606, accuracy 53.33%,
calibration error 1.85% (market 2.15%), n = 1,140 across 12 seasons.

## Verified on this date

- 7 pages + archive render from real payloads, 0 console errors, 0 failed requests.
- Fixtures page: 379 rows (119 results, 260 upcoming), search, matchweek and
  status filters, counts and URL state all driven by real data.
- Match pages for an upcoming fixture and a settled one: real probabilities, most
  likely scoreline, actual xG, de-vigged market reference, 404 state for unknown ids.
- Metrics/models/calibration pages read the exported reports, not constants.
- Payload checker: 0 failures, 0 warnings. Python suite: 34 passed.

## Not verified / known gaps

- No live match was in play during the session, so the live-score path and the
  provider reconciliation of a freshly finished match were not exercised end to end.
- Scoreline grids exist for the historical test period only; upcoming match pages
  hide the interactive field instead of inventing one.
- Mobile verified at 390 px on every page (no horizontal overflow); no assistive
  technology pass was run.
- Sitemap deliberately removed until a production origin exists.

---

# 2026-11-12 (later) — Prediction ledger, verdicts and served grids

Approved design: three-layer learning with the model protected. Implemented the
tracking layer; the model itself is untouched.

## What was added

- `server/lib/db.mjs` — SQLite ledger (`data/calibra.db`, built-in `node:sqlite`).
  `forecasts` is write-once (UPDATE/DELETE blocked by trigger) and stores the
  blend, DC and CatBoost probabilities, top scoreline, export timestamp and a
  model fingerprint. `results` is correctable, with `result_revisions` auditing
  every change. RPS / log loss / accuracy / calibration are computed on read with
  the same maths as the locked evaluation.
- `server/lib/ledger-sync.mjs` + `scripts/sync_ledger.mjs` — import the exports
  into the ledger. Joined on `season|home|away`, so a rescheduled fixture still
  finds its own forecast.
- `server/app.mjs` — `/api/ledger`; provider-confirmed results are now persisted
  to `data/raw/api_results_2627.json` instead of living only in memory.
- `server/index.mjs` — ledger sync on boot and after every results refresh.
- `scripts/export_scorelines_json.py` + `scripts/build_scoreline_files.mjs` — the
  existing parquet grids converted to one JSON file per fixture (conversion only,
  no refit). The match page now renders the real 225-cell field.
- `scripts/learning_report.mjs` — mistake patterns (calibration bias, goals
  buckets, confidence buckets, per-team bias, matchweek drift) → `reports/live_learning.md`.
  Insights only; it changes nothing.
- `tests/live_flow.test.mjs` — 9 `node:test` cases over simulated provider
  payloads: live merge, stale/error fallback, immutability, idempotent result
  updates, score corrections with revision history, late-forecast exclusion,
  provider-sourced results, grid integrity.
- Fixture centre now opens on the next matchweek; result rows and match pages
  show the archived model call and verdict once one exists.

## Evidence

- Ledger: 260 forecasts recorded, 119 results imported, 0 settled (results all
  predate the ledger). `/api/ledger` reports the same counts.
- Maths check: computing RPS/log loss/accuracy from `test_predictions.csv` with
  the ledger functions reproduces the locked report exactly (0.19293 / 0.96606 /
  53.33%, market 0.18877).
- Tests: `node --test tests/live_flow.test.mjs` 9/9 pass; payload checker passes;
  Python suite 34/34.
- Browser: fixtures opens on MW13 (10 rows), match page renders 225 grid cells
  and the 5-item scoreline list, performance page shows the separate season
  record at 0 settled, no console errors, no overflow at 390 px.

## Still not proven

- No live La Liga match was observed end to end. Live rendering and automatic
  settlement are proven against simulated payloads only.
- The record is empty until MW13 is played, so the season-metrics path has not
  run on real settled forecasts.
- Nothing schedules `--predict`; the refit is still manual and unversioned per run
  (the ledger records a model fingerprint, so forecasts can be traced).
