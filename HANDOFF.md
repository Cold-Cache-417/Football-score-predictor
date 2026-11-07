# HANDOFF — La Liga Football Score Predictor

Written by the incoming agent (Buffy) after a full read-only inspection on
2026-11-07. Everything below was verified against the repository itself.
Claims from the previous agent's reports were checked and are contradicted
where found to be false.

---

## 1. Project root

```
/Users/luqmankhan/Projects/Football-score-predictor
```

Confirmed. This directory contains `src/`, `data/`, `web/`, `reports/`,
`tests/`, `README.md`, `DATA_CONTRACT.md`, `DESIGN.md`.

## 2. Version control — read this first

**There is no Git repository.** `git rev-parse --show-toplevel` fails with
`fatal: not a git repository (or any of the parent directories): .git`, and
no `.git` directory exists at the root or above it.

Consequences:

- There is no branch, no commit history, no stash and no diff to inspect.
- There is no undo. Any change to application code cannot be reverted with
  `git checkout`.
- The instruction "preserve the existing repository and Git history" cannot
  be satisfied by preservation, because none exists. It can only be satisfied
  by **initialising** a repository before further edits so that future work
  is recoverable.

Recommendation (needs the user's approval before running): `git init`, add a
`.gitignore` entry for `data/raw`, `data/processed`, `.venv`, `node_modules`,
`.next`, then make one baseline commit of the current state. Do this **before**
the hero rework so the "before" state is recoverable.

## 3. What actually exists

| Area | State |
|---|---|
| Python modelling pipeline (`src/`, 16 modules) | Present and complete |
| Tests (`tests/`, 5 files) | Present; not executed during this inspection |
| Processed dataset | `data/processed/SP1_matches.parquet`, 6,189 matches, 17 seasons |
| Website exports | 4 of the 7 artefacts documented in `DATA_CONTRACT.md` |
| Fitted models | **Missing** — `data/website/models/` exists but is empty |
| Next.js app (`web/`) | Scaffold present, **production build fails** |
| Crest image assets | **None exist** |
| Pages | Only `/` (Home). No fixtures, match detail, or models page |
| FastAPI backend | **Does not exist** |
| Git | **Does not exist** |

## 4. Modelling results (unchanged, taken from `README.md` and `reports/`)

Locked test period 2023/24–2025/26, 1,140 matches, RPS lower is better:

| Model | RPS |
|---|---:|
| Bookmaker de-vigged | 0.1888 |
| Blend (65% DC / 35% CatBoost) | 0.1929 |
| CatBoost | 0.1933 |
| Dixon-Coles | 0.1941 |
| XGBoost | 0.2010 |
| Base rates | 0.2253 |

Paired tests as reported: blend beats Dixon-Coles (ΔRPS −0.00114, 95% CI
[−0.00206, −0.00022], P = 0.992); blend vs CatBoost statistically tied
(P = 0.646); bookmaker beats blend (ΔRPS +0.00416, P = 0.001).

**The model does not beat the market.** This must appear plainly on the site.

### Dataset verified directly from `data/processed/SP1_matches.parquet`

- 6,189 rows, 17 seasons, 2010-08-28 → 2026-11-02.
- Seasons 2010/11 … 2025/26 have 380 matches each.
- 2026/27 has 109 matches played.

This matches the README's "6,189 matches through 2026-11-02" claim. The older
"6,080 / 16 seasons" figure is the pre-extension state and is superseded.

## 5. Data contract status — discrepancies found

`DATA_CONTRACT.md` documents seven website artefacts. Only these four exist:

| File | Exists | Verified |
|---|---|---|
| `data/website/test_predictions.csv` | yes | 1,140 rows, seasons 2023/24–2025/26, all 27 documented columns |
| `data/website/test_scorelines.parquet` | yes | present (2.36 MB) |
| `data/website/test_scorelines_top5.csv` | yes | 5,700 rows = 1,140 × 5 |
| `data/website/upcoming_predictions.csv` | yes | header + 9 fixtures |
| `data/website/upcoming_scorelines_top5.csv` | **MISSING** | documented, absent |
| `data/website/upcoming_scorelines.parquet` | **MISSING** | documented, absent |
| `data/website/models/dixon_coles.pkl` | **MISSING** | documented, directory is empty |
| `data/website/models/catboost_model.cbm` | **MISSING** | documented, directory is empty |

Nothing in the current website needs the missing files — the upcoming CSV
already carries `top_home_goals`, `top_away_goals`, `top_prob`. But the
contract is not satisfied, and a FastAPI layer that promises to serve the
"full scoreline grid" for upcoming fixtures would have nothing to serve.

Cause is unconfirmed (UNVERIFIED). The directory timestamp (14:19) is later
than the other artefacts (13:19) while `upcoming_predictions.csv` was written
at 14:22, which suggests a partial or interrupted `src.export_website` run
rather than a design decision.

## 6. Upcoming-fixture snapshot

`data/website/upcoming_predictions.csv`, all `prediction_type = live_forward`,
season 2026/27:

| date | home | away | P(H) | P(D) | P(A) | top score | P(score) |
|---|---|---|---|---|---|---|---|
| 2026-11-07 | Malaga | Racing Santander | 0.4768 | 0.2557 | 0.2675 | 1–1 | 0.1017 |
| 2026-11-07 | Espanyol | Deportivo La Coruna | 0.4530 | 0.2876 | 0.2595 | 1–1 | 0.1284 |
| 2026-11-07 | Osasuna | Athletic Bilbao | 0.3408 | 0.2782 | 0.3810 | 1–1 | 0.1359 |
| 2026-11-07 | Valencia | Real Madrid | 0.1854 | 0.1967 | 0.6178 | 0–1 | 0.1176 |
| 2026-11-08 | Elche | Real Betis | 0.3081 | 0.2758 | 0.4162 | 1–1 | 0.1252 |
| 2026-11-08 | Real Sociedad | Rayo Vallecano | 0.5173 | 0.2636 | 0.2191 | 1–0 | 0.1268 |
| 2026-11-08 | Celta Vigo | Levante | 0.5234 | 0.2472 | 0.2294 | 1–1 | 0.1083 |
| 2026-11-08 | Villarreal | Getafe | 0.5847 | 0.2330 | 0.1823 | 1–0 | 0.1472 |
| 2026-11-08 | Atletico Madrid | Barcelona | 0.3308 | 0.2076 | 0.4616 | 1–1 | 0.1122 |

The `README.md` table listing ten fixtures including
`2026-11-06 Sevilla vs Deportivo Alaves` is **stale** — that row is no longer
in the CSV. The current snapshot is as of 2026-11-07 and covers 9 unplayed
fixtures on 11-07 and 11-08.

## 7. Honesty rules for the UI

- Home/draw/away = the 65/35 blend. Exact scorelines = Dixon-Coles grid only.
  The two can disagree; that is expected and must be explained, not hidden.
- Upcoming predictions are a **static snapshot**, not live. The as-of date
  must be shown next to them.
- Never label upcoming predictions "LIVE". The previous UI did, in the nav
  and in the hero, while showing a fixture that had already kicked off.

## 8. Outstanding risks (as found, before the hero work)

1. No version control — any edit is irreversible.
2. Production build fails, so nothing can be shipped or screenshot-honestly
   verified until it is fixed.
3. Fixture selection ignores the current date.
4. No crest assets, despite the component and DESIGN.md implying real crests.
5. Existing screenshots do not represent the current code.

---

## 9. Addendum — 2026-11-07, after the Home hero checkpoint

All five risks above are now closed:

1. **Git exists.** Initialised on branch `main` with a baseline commit of the
   inherited state (84 files, no secrets, `.venv`/`node_modules`/`.next`/
   `data/raw`/`data/processed`/`catboost_info`/`.pytest_cache`/
   `.playwright-mcp` excluded). Each later change is a separate commit.
2. **Build passes.** Two type errors fixed (named vs default `Hero` import;
   undeclared `indicatorClassName` prop). `tsc --noEmit` and `npm run build`
   both exit 0; `/` renders as Partial Prerender.
3. **Fixture selection fixed.** Kickoff times from `data/raw/fixtures.csv` are
   interpreted as Europe/Madrid, converted to absolute instants, and only
   fixtures that have not started can be shown. Started matches are skipped;
   if none remain the hero shows an explicit stale-snapshot state.
4. **Crests exist.** 35 genuine Wikimedia crests in `web/public/crests/`, each
   recorded in `web/src/lib/crest-registry.json` with Wikipedia page, file
   page and licence (31 Fair use, 4 public domain). Initials fallback kept.
5. **Screenshots regenerated and inspected** at 1440×900 and 390×844, plus a
   reduced-motion capture at `design-check/hero-reduced-motion.png`.

One new environment issue was found and fixed: `next dev` never hydrated
because Next 16 rejects cross-origin dev resources from `127.0.0.1`, which
killed the HMR socket. `allowedDevOrigins: ["127.0.0.1"]` in `next.config.ts`
fixes it. This is why earlier dev-mode screenshots showed no animation or
interaction.

State of the web app, exports and remaining issues: see `CURRENT_STATE.md`.
Scope that was actually delivered: see `NEXT_TASK.md`.
