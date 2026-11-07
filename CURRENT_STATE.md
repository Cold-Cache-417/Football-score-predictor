# CURRENT_STATE — verified state of the project

Last full verification: **2026-11-07**, on the Home hero checkpoint.
Everything below was checked against the running app, not inferred from code.

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
