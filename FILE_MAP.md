# FILE_MAP — where everything lives

Navigation reference for `/Users/luqmankhan/Projects/Football-score-predictor`.
Verified 2026-11-07.

---

## Root

```
README.md            project narrative + all phase results + live fixture table (partly stale)
DATA_CONTRACT.md     source of truth for every exported artefact and probability meaning
DESIGN.md            design direction v3 (dark-only); contains several claims the code contradicts
HANDOFF.md           incoming inspection summary + verification status
AGENT_SETUP.md       tools, skills, MCP status in this environment
CURRENT_STATE.md     what works, what is broken, with evidence
NEXT_TASK.md         approved scope for the Home hero block
FILE_MAP.md          this file
requirements.txt     Python pins
.gitignore           venv / raw / processed / pycache  (note: nothing is tracked, no repo exists)
```

## `src/` — Python modelling pipeline (do not modify during website work)

| File | Role |
|---|---|
| `config.py` | `LEAGUES`, `SEASON_OVERRIDES`, `TEAM_ALIASES`, constants |
| `download.py` | Fetches football-data.co.uk season CSVs + `fixtures.csv` |
| `clean.py` | Cleans results, canonicalises team names, `clean_fixtures` |
| `devig.py` | Overround removal (proportional + Shin) |
| `build_dataset.py` | Phase 1 → `data/processed/SP1_matches.parquet` |
| `backtest.py` | Walk-forward matchweek loop, locked test period |
| `metrics.py` | RPS, log loss, accuracy, bootstrap paired tests |
| `features.py` | Pre-match Elo / pi-ratings / form / rest / promoted flags |
| `ml_models.py` | CatBoost + XGBoost wrappers, tuning grid |
| `run_phase2.py` | Dixon-Coles baseline + backtest → `reports/` |
| `run_phase3.py` | ML upgrade |
| `run_phase4.py` | Blend weight tuning on validation, single test evaluation |
| `blend.py` | Blend helpers |
| `export_website.py` | Phase 4.5 — refit on all completed matches, export website artefacts |
| `understat.py` | Optional xG fetcher (fails soft) |
| `__init__.py` | package marker |

## `tests/`

`test_clean.py`, `test_devig.py`, `test_features.py`, `test_backtest.py`,
`test_phase4.py`. Run with `.venv/bin/python -m pytest tests -q`.
Not executed during the incoming inspection (no model code was touched).

## `data/`

```
data/raw/SP1_1011.csv … SP1_2627.csv   cached season results (17 files)
data/raw/fixtures.csv                  cached football-data upcoming fixtures
data/raw/SP1_2026                      stray directory, contents unverified
data/processed/SP1_matches.parquet     6,189 matches, 17 seasons, → 2026-11-02
data/processed/backtest_predictions.parquet
data/processed/backtest_predictions_ml.parquet
data/processed/backtest_predictions_blend.parquet
data/website/test_predictions.csv      1,140 rows — H/D/A for every model + book + results
data/website/test_scorelines.parquet   225-cell DC grid per test match
data/website/test_scorelines_top5.csv  5,700 rows
data/website/upcoming_predictions.csv  9 unplayed fixtures, snapshot 2026-11-07
data/website/models/                   EMPTY (documented pickles absent)
                                       upcoming_scorelines(.parquet) and
                                       upcoming_scorelines_top5.csv are missing
```

## `reports/`

Final artefacts used by a future Models page:
`test_metrics_final.csv`, `per_season_metrics_final.csv`,
`paired_tests_final.csv`, `blend_weight_tuning.csv`, `bookmaker_segments.csv`,
`calibration_bins.csv` (numeric source for the calibration chart),
`calibration_all.png`, `calibration_ml.png`, `calibration.png`.

Intermediate/earlier-pass artefacts (not final): `test_metrics.csv`,
`test_metrics_ml.csv`, `per_season_metrics.csv`, `per_season_metrics_ml.csv`,
`paired_tests.csv`, `paired_tests_ml.csv`, `xi_tuning.csv`, `ml_tuning.csv`.

## `web/` — Next.js 16 app (App Router, TS, Tailwind v4)

```
web/package.json          next 16.4.5, react 19.3.0, framer-motion, gsap, lenis
web/next.config.ts        cacheComponents + partialPrefetching + tailwind turbopack rule
web/components.json       shadcn config, new-york, @react-bits registry
web/tsconfig.json         strict, paths @/* → ./src/*
web/AGENTS.md             Next 16 warning: read node_modules/next/dist/docs before coding
web/public/               ONLY Next.js default SVGs — no crests
web/design-check/         (actually at repo root: design-check/) stale screenshots
```

`web/src/app/`

| File | State |
|---|---|
| `layout.tsx` | Newsreader + Archivo via next/font, dark body. ✅ do not change fonts |
| `page.tsx` | Server component: `SiteNav` + `Hero` + `nextUpcomingFixture()`. **Broken import** |
| `globals.css` | Tailwind v4 `@theme` dark tokens, volt accent, `.hero-fine-grid`. Light leftovers |
| `favicon.ico` | default |

`web/src/components/`

| File | State |
|---|---|
| `Hero.tsx` | Client. Count-up numerals, 3 outcome blocks, bottom scoreline row, WebGL ripple + CSS grid, per-mousemove React state. Default export only |
| `SiteNav.tsx` | Sticky nav, "LIVE" badge (inaccurate), season label |
| `TeamCrest.tsx` | Initials-in-circle only; no images, no asset lookup |
| `RippleGrid.tsx` | Complete self-contained WebGL2 ripple-grid (React Bits). Currently `glow=0`, `mouseInteraction=false` |
| `ui/button.tsx` | shadcn button |
| `ui/badge.tsx` | shadcn badge; default variant is volt-on-volt |
| `ui/card.tsx` | shadcn card; uses non-existent `rounded-16` |
| `ui/progress.tsx` | **type error** — undeclared `indicatorClassName` |
| `ui/tooltip.tsx` | Radix tooltip wrapper |

`web/src/lib/`

| File | State |
|---|---|
| `fixtures.ts` | Reads the absolute CSV path, parses by hand, `nextUpcomingFixture()` **lacks a past-date filter** |
| `teams.ts` | 28 club colours; some low contrast / duplicated |
| `utils.ts` | `cn()` |

## Root `design-check/`

`hero-desktop.png`, `hero-mobile.png` — stale, white-background, broken.
Do not treat as a design reference; regenerate as evidence.

## Addendum — files added on 2026-11-07 (Home hero checkpoint)

```
web/public/crests/*.png            35 real club crests from Wikimedia
web/src/lib/crest-registry.json    per-club source + licence + file page
web/src/lib/crests.ts              typed access to the registry
web/src/components/HeroSection.tsx server component: connection() + getHeroState()
```

Changed:

| File | Change |
|---|---|
| `web/src/lib/fixtures.ts` | rewritten — Europe/Madrid kickoff handling, status, empty state |
| `web/src/components/Hero.tsx` | rewritten — headline + scoreline + split bar + cursor light, no Framer Motion |
| `web/src/components/TeamCrest.tsx` | now renders `next/image` from the registry, initials fallback kept |
| `web/src/components/SiteNav.tsx` | "LIVE" badge removed |
| `web/src/app/page.tsx` | Suspense + `HeroSection`, static fallback shell |
| `web/src/app/globals.css` | dark-only tokens, atmosphere layers, bar reveal, reduced-motion rule |
| `web/src/components/ui/{progress,card,badge}.tsx` | type/utility fixes (`indicatorClassName`, `rounded-16`, `pine-700/300`) |
| `web/next.config.ts` | `allowedDevOrigins: ["127.0.0.1"]` so dev mode hydrates |
| `web/src/lib/teams.ts` | colours for all 35 clubs + readable-ink helper |
| `.gitignore` | ignores generated tooling output |
| `design-check/*.png` | regenerated screenshots (desktop, mobile, reduced motion) |

New docs: `HANDOFF.md`, `AGENT_SETUP.md`, `CURRENT_STATE.md`, `NEXT_TASK.md`,
`FILE_MAP.md`.

## `.playwright-mcp/`

One accessibility snapshot and one console log from 2026-11-07 11:05.
Useful evidence: the snapshot confirms the hero rendered Sevilla vs Deportivo
Alaves on 2026-11-06 and that the probability numerals were reading `0.00`
(the count-up starting value) at capture time. The console log shows no
errors — only React DevTools and HMR messages.
