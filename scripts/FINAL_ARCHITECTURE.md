# FINAL DEPLOYMENT ARCHITECTURE — Calibra La Liga

**Status:** planning only. Nothing installed, migrated, committed, pushed or deployed.
**Supersedes:** `scripts/vercel-deployment-plan.md`, `scripts/VERCEL_DEPLOYMENT_AUDIT.md`
**Hard constraints:** $0/month indefinitely · no paid plans · no trials · no credit-based services · no auto-billing · no Neon/Turso/Redis/KV/Blob · no unnecessary dependencies · prediction methodology, forecasts, history and ledger untouched.

---

## 0. Corrections to earlier audits

| Earlier claim | Verified reality | Evidence |
|---|---|---|
| "libSQL does not support triggers" | **False.** `CREATE TRIGGER` is supported. Only `INSTEAD OF` triggers on views are not, and we don't use them. | `tursodatabase/turso/COMPAT.md` |
| "Neon required because triggers fail" | **False.** No production DB is required at all. | §3 |
| "Upstash + KV + Blob + Cron are all necessary" | **False.** All four are removed. | §2 |
| "`/api/live` can be a Vercel Function" | **False, and now retracted.** API-Football explicitly warns against calling from serverless platforms. | §5 |

Also corrected: the ledger has **no hash columns**. Immutability is two `BEFORE UPDATE/DELETE` triggers plus `pair_key` as primary key, with corrections appended to `result_revisions`. What must be preserved is exactly: 260 forecast rows, 119 result rows, 2 triggers, the revision log, 2 season indexes.

---

## 1. What the system actually is

- Visitors **never write**. Every browser request is a `GET`.
- Writes happen in two off-request paths: weekly forecast generation (local model run) and result settlement.
- The ledger is 144 KB / 379 rows and append-only by construction.

A read-only site with append-only writes does not need a production database. It needs a publish step.

---

## 2. Service necessity review — final

| Service | Final verdict | Why |
|---|---|---|
| **Vercel Hobby** | **needed** | Static hosting + CDN. $0. |
| **GitHub Actions** | **needed** | Settlement + publish. Free on public repos. |
| **API-Football** | **optional** | Live scores only. Free tier, best-effort. Site works without it. |
| **football-data.co.uk** | **needed** | Authoritative results. Free, no key, no quota. |
| Turso / Neon | **removed** | No production DB. |
| Upstash / Vercel KV | **removed** | CDN is the shared cache. |
| Vercel Blob | **removed** | No runtime binary storage. |
| Vercel Cron | **removed** | Hobby cron is daily-only and would need a write endpoint. |
| Vercel Functions | **removed** | Zero functions. See §5. |

**Two services. Both $0. No database vendor, no cache vendor, no queue, no secrets in a runtime.**

---

## 3. Recommended architecture — static publish, zero functions

```
   local machine
   ┌──────────────────────────────┐
   │ data/calibra.db  (SQLite)    │  source of truth · gitignored · triggers intact
   └──────────────┬───────────────┘
                  │ export (existing scripts)
                  ▼
   ┌──────────────────────────────┐
   │ web/api/*.json               │  committed · diffable · reviewable
   │ web/data/website/scorelines/ │  260 published grid files
   └──────────────┬───────────────┘
                  │ git push
                  ▼
   ┌──────────────────────────────────────────────────────┐
   │ Vercel Hobby  (100% static)                          │
   │ /                     → web/                         │
   │ /api/fixtures         → api/fixtures.json            │
   │ /api/ledger           → api/ledger.json              │
   │ /api/live             → api/live.json                │
   │ /api/health           → api/health.json              │
   │ /api/bootstrap.js     → api/bootstrap.js (direct)    │
   └──────────────────────────────────────────────────────┘
                  ▲
                  │ scheduled commit
   ┌──────────────┴───────────────┐
   │ GitHub Actions               │  settlement + live snapshot
   │ football-data.co.uk (always) │
   │ API-Football (optional)      │
   └──────────────────────────────┘
```

### Why zero functions

API-Football's own rate-limit documentation states:

> "It is not recommended to call the API from environments where outbound IPs are shared among many different users. This can be the case with some managed or serverless services such as … **Vercel Functions**."

Rate limiting there is applied **per API key and per source IP**. A shared Vercel egress IP can trigger a firewall block against the key. Losing the key to a block is a real failure mode, and the function buys us nothing: the data is a scheduled snapshot either way.

Moving the provider call into GitHub Actions removes the entire risk class, and as a side effect **removes Vercel Functions from the architecture completely**. No invocations, no cold starts, no CPU budget, no function limits.

### Frontend impact: none

`vercel.json` rewrites preserve every existing `/api/*` URL. `web/assets/js/app.js` is unchanged.

```json
{
  "framework": null,
  "buildCommand": "",
  "outputDirectory": "web",
  "rewrites": [
    { "source": "/api/fixtures", "destination": "/api/fixtures.json" },
    { "source": "/api/ledger",   "destination": "/api/ledger.json" },
    { "source": "/api/live",     "destination": "/api/live.json" },
    { "source": "/api/health",   "destination": "/api/health.json" }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ]
}
```

**Published artifacts live inside `web/`, not beside it.** Rewrite destinations resolve against the output directory, so `/data/published/*` would 404 when the output root is `web/`. The exports are therefore written to:

| Artifact | Path | Served at |
|---|---|---|
| Fixtures export | `web/api/fixtures.json` | `/api/fixtures` |
| Ledger export | `web/api/ledger.json` | `/api/ledger` |
| Live snapshot | `web/api/live.json` | `/api/live` |
| Health | `web/api/health.json` | `/api/health` |
| Bootstrap | `web/api/bootstrap.js` | `/api/bootstrap.js` (real file, no rewrite) |
| Scoreline grids (260) | `web/data/website/scorelines/*.json` | `data/website/scorelines/*.json` (existing frontend path) |

`web/data/website/scorelines/` preserves the exact path `app.js:1170` already fetches, so the frontend still needs no change. Both new paths must be un-ignored in `.gitignore` — they are currently excluded by `data/website/scorelines/` and the `data/website/*.json` rules.

---

## 4. GitHub Actions reliability

### Documented behaviour

| Property | Value | Source |
|---|---|---|
| Minimum interval | 5 minutes | GitHub docs |
| Timing guarantee | **none** — best effort | GitHub docs |
| Common delay | 5–30 min at the top of the hour; longer during incidents | GitHub docs |
| Dropped runs | possible under heavy load | GitHub docs |
| Default branch only | schedule fires from the latest commit on `main` | GitHub docs |
| Public repo inactivity | schedule auto-disabled after **60 days** with no repo activity | GitHub docs |
| Manual trigger | `workflow_dispatch` | GitHub docs |
| Minutes, public repo | free / unlimited | GitHub pricing |

### What happens if the run is late, skipped or fails

**Nothing user-facing breaks.** The site keeps serving the last published snapshot. Settlement is eventually consistent, not real-time — a delayed run means a result appears late, never wrong.

| Event | Effect | Recovery |
|---|---|---|
| Run delayed 30 min | Result appears 30 min late | self-corrects on next run |
| Run skipped / dropped | Result appears late | next scheduled run picks it up |
| Run fails (network, provider 5xx) | No commit, no deploy | retry in-script, then next run; manual rerun |
| Provider quota exhausted | live snapshot stale, results still flow from football-data | next UTC day reset |
| Repo inactive 60 days | schedule silently stops | any push re-enables, or `gh workflow enable` |

### Retry design (zero dependencies)

- In-script bounded retry: 3 attempts, exponential backoff (2 s → 8 s → 30 s), only on network/5xx. No third-party retry action.
- `concurrency: { group: settlement, cancel-in-progress: false }` — overlapping runs queue instead of racing.
- Cron `2,12,22,32,42,52 * * * *` — 10-minute cadence, deliberately off the top-of-hour, combined with the live-window guard (§5.1).
- In-script match-window guard: exit early (no provider call) when no La Liga fixture can be live. Keeps daily runs cheap and quota-safe.

### Idempotency

Re-running settlement any number of times is safe, by construction:

| Path | Behaviour |
|---|---|
| Forecast insert | `INSERT OR IGNORE` on `pair_key` → write-once |
| Result, no existing row | insert + `result_revisions` row, `revision = 1` |
| Result, same score | returns `unchanged`, **no write** |
| Result, corrected score | `revision + 1`, appends to `result_revisions` |
| Publish step | commits only if `git diff --quiet` is false |

A replayed run therefore produces an empty diff and no deployment.

### Failure detection

1. GitHub emails the workflow's actor on scheduled failure (default).
2. `health.json` carries `last_success_at` and `last_attempt_at`, published to the site — staleness is visible, not silent.
3. Manual rerun: Actions tab → *Run workflow*, or `gh workflow run settlement.yml`.
4. Local equivalent: `node scripts/sync_ledger.mjs` then the publish script.

---

## 5. API-Football — verified quota and degradation

### Verified free tier

| Property | Value |
|---|---|
| Price | $0, no card required, "free plan for ever" |
| Daily quota | **100 requests/day**, reset 00:00 UTC, unused lost |
| Per-minute cap | **10 requests/minute** |
| Endpoints | all endpoints available on free |
| Seasons | free plan is limited in available *historical* seasons |
| Overages | **"You'll never be overcharged. once your quota is reached, the API automatically stops processing requests and sends an error message instead of billing extra."** |
| Logos/images | do not count toward quota |
| Serverless use | **explicitly discouraged** (shared IP blocks) |

### 5.1 Request budget model (derived, not estimated)

Computed from the real schedule in `data/raw/schedule_2627.json`: **380 fixtures across 69 fixture-days**. A "live window" is `[kickoff, kickoff + 135 min]` (90 + half-time + stoppage + settle lag), unioned per day so overlapping matches cost one poll, not one per match.

| Metric | Value |
|---|---|
| Fixture-days per season | 69 |
| Worst single day — live-window span | **540 min (9 h)** |
| Average fixture-day — live-window span | 222 min |
| Polls at **10-min** cadence — worst day | **55** |
| Polls at **10-min** cadence — season total | 1,627 |
| Polls at 15-min cadence — worst day | 37 |
| Polls at 5-min cadence — worst day | 110 → **exceeds 100/day, excluded** |

Call inventory — API-Football only (football-data.co.uk is unlimited and keyless):

| Call | Endpoint | Frequency | Worst day |
|---|---|---|---|
| Live poll | `/fixtures?live=all&league=140` | 1 per run, inside live window | 55 |
| Final-score sweep | `/fixtures?date=YYYY-MM-DD&league=140` | 1 per fixture-day, 2 h after last kickoff | 1 |
| Reconciliation fallback | `/fixtures?date=…` | ≤1 per day, only if a result is still missing | 1 |
| **Total** | | | **57 of 100** |

**Budget verdict**

| Day type | Calls | Utilisation |
|---|---|---|
| Worst day of the season | 57 | 57% (43 calls reserve) |
| Average fixture day | ~25 | 25% |
| Quiet day | 0 | 0% |
| Season total | ~1,700 over ~9 months | ~6.5/day average |

**Rule: 10-minute polling inside live windows only. 5-minute polling is not affordable and is excluded.** The per-minute cap (10/min) is never approached — one call per run, at most three in a sweep run.

### 5.2 Enforcement — three independent layers

1. **Window guard.** No provider call unless some fixture is inside `[kickoff − 5 min, kickoff + 135 min]`. On its own this caps a day at 55 calls.
2. **Provider header gate.** Read `x-ratelimit-requests-remaining` from every response and refuse to call once it falls below `PROVIDER_RESERVE = 25`. The provider's own counter is authoritative and survives ephemeral runners.
3. **Concurrency group.** `concurrency: settlement` with `cancel-in-progress: false` — two runs can never double-spend.

**Unknown-counter policy (fail closed).** The first call in a fresh process is allowed so the counter can be learned. If a response arrives *without* `x-ratelimit-requests-remaining`, the budget is set to 0 and every further call in that process is refused — one blind call maximum. The last known value is committed in `health.json.quota.remaining` and re-seeded via `PROVIDER_REMAINING`, so a fresh runner is never blind after the first successful run.

**Gap in the current code that must be fixed:** `call()` in `server/lib/live.mjs` increments a local JSON file and hard-stops at 100, but that file is ephemeral in Actions, so the counter resets on every run. It also ignores the provider's `x-ratelimit-requests-remaining` header entirely. Both must change before automation is enabled — see Phase D.

### 5.3 Local development shares the same 100/day pool

The local server and GitHub Actions use the same key, so they share one quota. Rules:

- Run the local server with `RESULTS_REFRESH_MIN=0` (already the documented command).
- Do not loop `/api/live` locally on a match day.
- The existing local quota file remains the local guard; the header gate covers Actions.

### 5.4 Calls deliberately not made

| Need | Source | Cost |
|---|---|---|
| Season fixtures | openfootball schedule (free plan is season-restricted) | 0 |
| Team / league metadata | static in repo | 0 |
| Standings | computed locally from results | 0 |
| Results, xG, closing odds | football-data.co.uk | 0 (no key, no quota) |
| Logos / crests | static assets | 0 |

### 5.5 What happens at the ceiling

1. API returns HTTP `429` with `errors.rateLimit`.
2. Our script catches it, sets `live.json` → `{ "state": "unavailable", "reason": "quota" }`, and **does not retry** (retrying is what triggers key/IP blocks).
3. Results continue to settle from **football-data.co.uk**, which has no key and no quota.
4. The site renders normally: no live ticker, last-known scores and all forecasts intact.

### Graceful degradation contract

| Condition | `/api/live` | Rest of site |
|---|---|---|
| Normal | `state: "ok"` + matches | works |
| No key configured | `state: "unconfigured"` | works |
| Quota exhausted | `state: "unavailable"`, `reason: "quota"` | works |
| Provider 5xx / timeout | `state: "unavailable"`, `reason: "upstream"` | works |
| No match in progress | `state: "idle"` | works |

The frontend must treat `state !== "ok"` as "no live data", never as an error page. This is a small, explicit change in the live rendering path.

**Live scores are best-effort and optional. They are never required for the site to function.**

---

## 6. Vercel Hobby — verified limits and fit

### Verified included allotments (Hobby)

| Resource | Included / month | Our projected use | Headroom |
|---|---|---|---|
| Fast Data Transfer | 100 GB | < 2 GB | ~50× |
| Function Invocations | 1,000,000 | **0** | ∞ |
| Fast Origin Transfer | 10 GB | ~0 | ∞ |
| Active CPU | 4 hours | **0** | ∞ |
| Provisioned Memory | 360 GB-hrs | **0** | ∞ |
| Image Optimizations | 5K | 0 (no optimizer) | ∞ |
| Deployments | 100/day, 100/hour | ~5/day | 20× |
| Build time | 45 min/deploy | **no build** (`buildCommand: ""`) | ∞ |
| Static file upload (CLI) | 100 MB | < 10 MB | 10× |
| Files per deployment | 15,000 | ~300 | 50× |
| Projects | 200 | 1 | — |
| Custom domains | included | optional | — |

Static hosting is explicitly **not** counted as a build, so deployments are cheap and fast.

### Can quota exhaustion trigger paid usage?

**No.** Hobby has no on-demand billing path — the usage-based rates in Vercel's docs apply to **Pro** ("Vercel bills Pro usage through included credit and on-demand rates"). Hobby has no included credit and no overage mechanism. Exceeding a fair-use guideline leads to a notification and, in the worst case, a paused project. There is no mechanism by which a Hobby project generates an invoice.

**Residual restriction:** Hobby is **non-commercial only**. No ads, no paid access, no client work. If the site is ever monetised, the $0 guarantee ends and a paid plan becomes mandatory. This is the single most important condition in the whole document.

---

## 7. Public static data audit

### 7.1 Blocking finding: `web/` is not a clean static directory

`web/` currently contains a **tracked Next.js application scaffold** alongside the real static site:

| Item | Size | Tracked | Risk |
|---|---|---|---|
| `web/package.json` — `next@16.4.5`, React 19, Tailwind 4 | — | yes | Vercel would detect Next.js, run `next build`, and deploy the wrong thing |
| `web/package-lock.json` | — | yes | same |
| `web/next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `components.json` | — | yes | build detection |
| `web/src/` | 136 KB | 59 files | React source published |
| `web/screenshots/` | 3.4 MB | yes | internal QA published |
| `web/shots/` | 5.4 MB | yes | internal QA published |
| `web/qa-final/` | 2.7 MB | yes | internal QA published |
| `web/.next/dev/logs/next-development.log` | 4 KB | **no** (ignored) | contains absolute local paths `/Users/luqmankhan/...` |
| `web/AGENTS.md`, `web/README.md` | — | yes | internal docs published |

**Without an explicit ignore list, deploying this repo would either fail the build or publish ~11.5 MB of internal QA material and local filesystem paths.**

### 7.2 Required `.vercelignore`

```
# build detection — must not look like a Next.js app
web/package.json
web/package-lock.json
web/next.config.ts
web/tsconfig.json
web/eslint.config.mjs
web/components.json
web/.next/
web/src/
web/public/

# internal artifacts inside web/
web/screenshots/
web/shots/
web/qa-final/
web/AGENTS.md
web/README.md

# repository dirs — not served, and must never be uploaded by accident
src/
ops/
concept/
app/
catboost_info/
design-check/
graphify-out/
web-classic/
screenshots/
reports/
server/
tests/
scripts/
.venv/
.git/
.env
.env.*
*.md

# data — never deployable
data/raw/
data/processed/
data/calibra.db
data/calibra.db-wal
data/calibra.db-shm
data/website/*.parquet
data/website/*.csv
data/website/models/
data/website/test_*
data/website/upcoming_*
```

**This is a denylist, so it must be paired with a positive assertion.** The deployment file list — not the ignore file — is the thing that gets tested:

| Assertion | Pass condition |
|---|---|
| Every served path | starts with `web/` and is not in the denylist above |
| Required artifacts present | `web/api/{fixtures,ledger,live,health}.json`, `web/api/bootstrap.js`, 260 files under `web/data/website/scorelines/` |
| Forbidden paths | `package.json`, `src/`, `screenshots/`, `shots/`, `qa-final/`, `.next/`, `.env`, `calibra.db`, `server/` — all absent |

The repo has 15 top-level directories (`app/`, `catboost_info/`, `concept/`, `design-check/`, `graphify-out/`, `ops/`, `reports/`, `screenshots/`, `scripts/`, `server/`, `src/`, `tests/`, `web-classic/`, `web/`, `data/`). A denylist that misses one of them is a leak, which is why the assertion above is a required Phase 1 exit test rather than a review step.

### 7.3 Per-export secret audit

| Export | Source | Fields | Secrets / PII | Verdict |
|---|---|---|---|---|
| `fixtures.json` | `buildPayload()` | fixtures, standings, teamForm, metrics, models, performance, meta | none — probabilities, scores, team slugs | safe |
| `ledger.json` | `buildEvaluations()` + `listForecasts()` | season, record, counts, per-match probabilities, verdicts | none — public model output | safe |
| `bootstrap.js` | same payload | `window.CALIBRA_BOOTSTRAP = {…}` | none | safe |
| `live.json` | provider snapshot | state, matches, minute, score | none — `providerInfo()` returns `{name, configured, planNote}` only; **the key is never included** | safe |
| `health.json` | `runtime`, `quotaStatus()`, file mtimes | ok, startedAt, quota counts, ledger stats | none — quota *counts*, not the key | safe |
| `scorelines/*.json` (260 files) | `build_scoreline_files.mjs` | `fixtureId`, `generatedAt`, 15×15 `grid`, `top` | none | safe |

Verified by inspection:

- `providerInfo()` returns `{ name, configured, planNote }` — `configured` is a boolean, not the key.
- `quotaStatus()` returns `{ day, used, limit, remaining, coolingDownUntil }` — counts only.
- The only secret in the project is `FOOTBALL_API_KEY` in `~/.config/calibra/env` (mode `600`), which is outside the repo and outside every publish path.
- `PUBLIC_ROOTS` in `server/app.mjs` already restricts serving to `web/` and `data/website/scorelines/`. The `.vercelignore` above reproduces that allowlist at the platform level.

### 7.4 Consistency checks before publish

| Check | Assertion |
|---|---|
| Forecast count | never decreases; currently 260 |
| Result count | never decreases; currently 119 |
| Triggers present | both `forecasts_no_update` and `forecasts_no_delete` in `sqlite_master` |
| Late flags | preserved unchanged |
| Cross-file | `ledger.json.forecasts` matches `fixtures.json` forecast entries for the same `pair_key` |
| Scoreline files | exactly 260 under `web/data/website/scorelines/`, each a 15×15 grid, every id present in `fixtures.json` |
| Idempotent republish | content identical excluding `generatedAt` → **no commit, no deploy** |
| Generated timestamp | monotonic across publishes, but **excluded from the diff decision** |
| Schema keys | no unexpected top-level keys added to any export |

A failed assertion aborts the publish. **Bad data cannot reach production.**

---

## 8. End-to-end publishing pipeline

### 8.1 Weekly forecast publish (manual, deliberate)

```
1. scripts/refresh_pipeline.py --results --fixtures --site --predict
      → data/raw/SP1_2627.csv, schedule_2627.json, season_results.csv,
        upcoming_predictions.csv
2. node scripts/sync_ledger.mjs
      → INSERT OR IGNORE forecasts · recordResult for finished matches
3. node scripts/check_site_data.mjs
      → UI invariants
4. node scripts/real_match_verify.mjs
      → exit ≠ 0 on any ledger inconsistency
5. node scripts/publish_snapshot.mjs          (new, ~60 lines)
      → writes web/api/*.json + web/data/website/scorelines/*.json,
        runs §7.4 assertions, aborts on failure
6. git add web/api web/data && git commit && git push
7. Vercel auto-deploys from main
```

Steps 1–2 are the existing, unchanged pipeline. Step 5 is the only new script.

### 8.2 Scheduled settlement (automated)

```
GitHub Actions · cron 2,12,22,32,42,52 · live-window guarded (≤57 calls on the worst day)
1. checkout main
2. scripts/refresh_pipeline.py --results --site        (football-data, no key)
3. optional live snapshot                              (API-Football, budget-capped)
4. node scripts/sync_ledger.mjs                        (idempotent)
5. node scripts/check_site_data.mjs && node scripts/real_match_verify.mjs
6. node scripts/publish_snapshot.mjs                   (assertions)
7. commit only if diff exists → Vercel auto-deploys
```

### 8.3 Result corrections

A correction follows the identical path. `recordResult` detects the changed score, increments `revision`, appends to `result_revisions`, and the correction is published through the same validate → commit → deploy gate. History is never overwritten — the previous score remains in `result_revisions`.

### 8.4 Rollback and recovery

| Scenario | Action | Time | Data loss |
|---|---|---|---|
| Bad data published | `git revert <sha>` → auto-redeploy | ~2 min | none |
| Bad code deployed | Vercel → promote previous deployment | ~30 s | none |
| Workflow broken | `git revert` the workflow commit; site unaffected | ~2 min | none |
| Provider outage | no action; static data serves | 0 | none |
| Provider key blocked | unset `FOOTBALL_API_KEY`; live degrades, results unaffected | 0 | none |
| Ledger corrupted locally | `scripts/backup_ledger.sh` restore (14-day retention) | ~1 min | since last backup |
| Total loss of local DB | rebuild site from `web/api/*.json` in git | ~10 min | none for published data |
| Vercel project paused | re-deploy after quota resets; local server remains reference | hours | none |

**Recovery guarantee:** `web/api/*.json` plus `web/data/website/scorelines/*.json` in git are a complete, self-sufficient copy of everything the site serves. The site can be rebuilt read-only from git alone.

### 8.5 CI ledger source — resolved: direct commit

`data/calibra.db` is gitignored and untracked (verified: 0 tracked files). A fresh Actions runner therefore has **no ledger**, and `openLedger()` silently creates an empty schema. The first scheduled run would either fail the "counts never decrease" assertion or publish a truncated ledger over production history.

| Option | How | Cost | Consequence |
|---|---|---|---|
| **A. Commit the ledger (recommended)** | checkpoint WAL, commit `data/calibra.db` (~144 KB); CI appends and commits | ~144 KB per settlement commit, ~14 MB/season | automation works; ledger auditable in git; repo is public, so the ledger becomes public — it is already served publicly |
| **B. Manual publishing only** | no scheduled settlement; owner runs the pipeline locally and pushes | 0 | no automation; settlement depends on the owner being present |
| **C. Rebuild DB in CI from published JSON** | CI reconstructs a ledger from `web/api/*.json` | 0 storage | loses `result_revisions` history and the trigger guarantees — not acceptable |

**Resolved — direct commit of `data/calibra.db`.** The database was audited (13 Nov 2026): 3 tables, 2 triggers, 2 indexes; 260 forecasts / 119 results / 119 revisions. Scanned for API keys, tokens, secrets, passwords, credentials, emails, URLs and absolute paths — **zero hits**. Every text column holds football metadata (`season`, `model_version`, `prediction_type`, `source`, `status`, `late`). It contains only public football data.

- The WAL is checkpointed (`PRAGMA wal_checkpoint(TRUNCATE)`) before each commit, so the file is self-contained.
- `data/calibra.db-wal` and `-shm` stay gitignored.
- The JSON exports are committed alongside it, so every change is reviewable as text even though the DB is binary.
- No rebuild script, no round-trip test, no reconstruction failure surface.

Result: triggers, revisions and indexes are preserved natively; automation works; no secret or internal file is published.

Two safeguards still apply:

- `git revert` of a settlement commit replaces the DB file wholesale and **bypasses the immutability triggers**. Reverting a data commit is therefore a deliberate restore, and must be preceded by a `backup_ledger.sh` snapshot.
- CI must never issue `UPDATE` or `DELETE` against `forecasts`. The triggers enforce this and the run must fail loudly if either trigger is missing.

This is settled: the ledger stays gitignored, exports are committed, and no policy exception is needed.

---

## 9. What is lost, and whether it matters

| Capability | Before | After | Impact |
|---|---|---|---|
| Settlement latency | ~30 min in-process | 15–45 min (schedule + delay) | none in practice |
| Live score freshness | ~2 min | ~15 min, match windows only | visible staleness; label it honestly |
| Live scores when quota exhausted | degraded | degraded identically | none |
| Instant correction without deploy | yes | deploy required (~2 min) | rare event |
| New forecasts appearing automatically | yes | weekly publish step | already the workflow |
| In-memory caches | yes | CDN | equivalent |
| Functions / cold starts | yes | **none** | improvement |

**Not lost:** every page, forecast, result, archive entry, ledger view, accuracy metric, match page, the design system, the accessibility work, and the immutability guarantees.

The honest limitation: **this is a publish-based site with best-effort live scores, not a live-data service.** For a weekly La Liga prediction ledger, that is the correct trade and the only way to guarantee $0 forever.

---

## 10. Residual risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vercel Hobby becomes commercial-only enforcement | low | site must move | site is static; any static host works |
| Vercel changes Hobby terms | low | possible migration | static output is portable |
| GitHub Actions schedule disabled after 60 days idle | medium | settlement stalls | any commit re-enables; manual rerun |
| API-Football blocks shared runner IP | medium | live scores stop | optional feature; results unaffected |
| API-Football free tier shrinks | low | live scores stop | results unaffected |
| Local dev and Actions share the same 100/day key | medium | quota exhausted mid-match | header gate reserves 25 calls; don't poll locally on match days (§5.3) |
| Committing the ledger makes it public | certain | none — audited: public football data only | accepted and intended (§8.5) |
| `git revert` of a data commit bypasses immutability triggers | medium | settled results could disappear | back up before reverting a data commit (§8.5) |
| Scoreline grids missing from the deploy | high if unaddressed | every match page loses its grid | 260 files committed under `web/data/website/scorelines/`, counted in Phase 1 exit tests |
| `web/` Next.js scaffold accidentally deployed | **high if ignored** | wrong site + internal leak | §7.2 `.vercelignore` — must be verified post-deploy |
| Repo growth from published JSON | low | repo bloat | commit only on real change; JSON is ~1 MB total |

---

## 11. Fallback if requirements change

If instant settlement or DB-backed reads later become non-negotiable, the next step is **Turso Cloud Free** — not Neon:

- Same SQL dialect, no schema translation.
- Triggers verified supported.
- Free tier: 100 DBs, 5 GB, 500M rows read/mo, 10M rows written/mo, 1-day PITR.
- Overages are not enabled on Free → `BLOCKED` errors, never a bill.

Cost: one dependency, sync→async conversion of 7 functions in `server/lib/db.mjs`, 5 handlers. ~4–5 hours. **Not required today.**

---

## 12. Implementation plan — 3 phases

### 12.0 Operating protocol (applies to every phase)

1. **One phase at a time.** A phase is not started until the previous phase's report is approved.
2. **Iron law — no completion claim without fresh evidence.** Every phase report quotes the command that was run and its actual output. "Should work", "looks right" and "probably fine" are not evidence.
3. **Exit tests are pass/fail, not narrative.** A phase that fails any exit test is reported as failed, with the failing output, and does not proceed.
4. **Staged exposure.** Nothing reaches production until it has passed on a preview URL. Production promotion happens only when every diff is empty.
5. **Rollback is verified, not assumed.** Every phase that changes the live site proves its rollback path before declaring success.
6. **Unverified work is labelled unverified.** Anything that could not be tested is listed explicitly in the report rather than omitted.

**Phase report format (required for each of the three):**

| Section | Content |
|---|---|
| Done | what was changed, with file paths |
| Evidence | command run → actual output (counts, diffs, exit codes) |
| Failed / skipped | anything that did not pass, and why |
| Unverified | anything that could not be tested in this environment |
| Rollback | how to undo this phase |
| Gate | PASS / FAIL, and the approval being requested |

---

### Phase 1 — Prepare

**Goal:** everything staged, proven locally, and reversible. No public deployment, no enabled automation, no push that triggers a build.

**1.0 Decisions that must be settled before any file changes**
- [ ] **CI ledger source** (§8.5): direct commit of `data/calibra.db`, WAL checkpointed before commit
- [ ] If A: checkpoint the WAL, confirm `data/calibra.db` is a single ~144 KB file, and confirm both triggers survive the copy
- [ ] Confirm `web/api/` and `web/data/website/scorelines/` are un-ignored in `.gitignore` (currently excluded by `data/website/*.json` and `data/website/scorelines/`)
- [ ] Confirm the repo is public, so committing the ledger is an accepted exposure (it is already served publicly)

**1.1 Deployment hygiene**
- [ ] Add `.vercelignore` exactly as §7.2
- [ ] Confirm `web/package.json`, `web/package-lock.json`, `web/next.config.ts`, `web/tsconfig.json`, `web/eslint.config.mjs`, `web/components.json` are excluded
- [ ] Confirm `web/screenshots/`, `web/shots/`, `web/qa-final/`, `web/src/`, `web/public/`, `web/.next/` are excluded
- [ ] Confirm `web/AGENTS.md`, `web/README.md` are excluded
- [ ] Confirm `.env*`, `data/raw/`, `data/processed/`, `data/calibra.db*`, `server/`, `tests/`, `scripts/`, `reports/`, `.venv/` are excluded

**1.2 Vercel static hosting configuration**
- [ ] Add `vercel.json`: `framework: null`, `buildCommand: ""`, `outputDirectory: "web"`
- [ ] Add 4 rewrites (`fixtures`, `ledger`, `live`, `health`) pointing inside `web/api/`; `bootstrap.js` is a real file and needs none
- [ ] Add the `/api/(.*)` `Cache-Control: public, max-age=0, must-revalidate` header
- [ ] Re-declare security headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`
- [ ] Validate the JSON parses
- [ ] Generate the deployment file list and assert every served path is under `web/` and matches §7.2

**1.3 Static JSON export and validation**
- [ ] Write `scripts/publish_snapshot.mjs` (read DB → write `web/api/*.json` + `web/data/website/scorelines/*.json` → run §7.4 assertions → abort on failure)
- [ ] First run produces **260 forecasts / 119 results / 260 scoreline files**
- [ ] Assert no top-level key outside the allowlist in any export
- [ ] Grep every export and every scoreline file for `apiKey|secret|token|password|/Users/` → zero hits
- [ ] Byte-compare each export against the local server's response for the same URL
- [ ] Re-run the exporter twice and confirm the second run produces an empty content diff (ignoring `generatedAt`)

**1.4 GitHub Actions workflow preparation (written, not enabled)**
- [ ] `settlement.yml`: cron `2,12,22,32,42,52`, `workflow_dispatch`, `concurrency: settlement` with `cancel-in-progress: false`, 3-attempt backoff
- [ ] Commit only on non-empty diff
- [ ] Assert 5-minute cadence is never configured anywhere
- [ ] Failure notification path defined; `health.json.last_success_at` and `quota.remaining` fields defined
- [ ] Workflow YAML validates; workflow stays unmerged and disabled until Phase 2.6

**1.5 API quota protection implementation**
- [ ] `call()` reads `x-ratelimit-requests-remaining` and exposes it to the caller
- [ ] Hard gate: no provider call when remaining < `PROVIDER_RESERVE` (25)
- [ ] Replace the ephemeral file counter with the header as the source of truth in Actions (keep the file counter for the local server)
- [ ] Live-window guard implemented: zero calls outside `[kickoff−5m, kickoff+135m]`

**Phase 1 exit tests**

| Test | Pass condition |
|---|---|
| Deployment file list | every path under `web/`; zero `package.json`, `.env`, DB, `src/`, `screenshots/` |
| Required artifacts | 5 files in `web/api/` + exactly 260 in `web/data/website/scorelines/` |
| Export counts | 260 forecasts / 119 results |
| Export secret scan | 0 hits across all 265 files |
| Export vs local server | byte-identical for all 5 endpoints |
| Idempotent export | second run → empty content diff |
| Budget replay (worst day 2026-09-12) | ≤ 57 calls |
| Quiet-day replay | 0 provider calls |
| Workflow YAML | parses; no 5-minute cron; disabled |
| Ledger file | 260 forecasts / 119 results / 119 revisions; both triggers; both indexes; `integrity_check` ok; WAL 0 bytes |
| Local test suite | `node --test tests/*.test.mjs` and `pytest` both green |

**Rollback:** delete the new files (`vercel.json`, `.vercelignore`, `publish_snapshot.mjs`, workflow). Nothing public was touched.

---

### Phase 2 — Deploy and connect

**Goal:** the site is live on Vercel, auto-deploying from GitHub, with automation connected — introduced on a preview URL first.

**Prerequisite checks (must pass before the schedule is enabled)**

| Check | Result |
|---|---|
| `node:sqlite` on Actions Node 24 | **PASS** — unflagged since 22.13/23.4; RC at 24.15+. `node-version: "24"` resolves to 24.20+ |
| `refresh_pipeline.py` in a clean runner | **PASS** — stdlib only on the `--results --fixtures --no-ledger` path; verified by parsing under `python3 -S`. `src` (pandas/catboost) is imported only by `--predict`, which CI never calls |
| `fixtures?live=all` includes just-finished matches | **UNVERIFIED** — needs a live match. Design does not depend on it: football-data.co.uk is the settlement source, so a dropped FT match shows "awaiting result" until it publishes |
| Quota gate when the counter is unknown | **FIXED** — fail closed after one blind call; last value seeded from `health.json.quota.remaining` |

**2.0 First live matchweek observation:** confirm whether FT matches appear in `live=all`. If they do not, the once-per-fixture-day sweep becomes mandatory rather than best-effort.

**2.1 Preview deployment**
- [ ] Deploy the working branch to a **preview** URL — never straight to production
- [ ] Diff all 5 endpoints: preview vs local — must be identical
- [ ] Confirm **0 functions** in the deployment summary
- [ ] Confirm the build log shows no Next.js detection
- [ ] Confirm `Cache-Control: public, max-age=0, must-revalidate` on `/api/*`
- [ ] Confirm `noindex` still present
- [ ] Lighthouse on the preview URL

**2.2 Connect GitHub automatic deployments**
- [ ] Connect the repo; production branch is `main`, branch pushes produce preview deployments only
- [ ] Verify a branch push creates a preview deployment and leaves production untouched
- [ ] Verify `main` has not been deployed yet

**2.3 Scheduled live-score polling (on the branch, preview-verified)**
- [ ] `live.json` contract implemented for `ok | idle | unavailable | unconfigured`
- [ ] Frontend updated to treat `state !== "ok"` as "no live data" — note `web/assets/js/data-live.js` currently tests `state === "error"`, which no longer exists in the contract
- [ ] Test on preview with key unset, key set + quota 0, and provider timeout
- [ ] Verify staleness is labelled honestly in the UI

**2.4 Result settlement and corrections (on the branch, preview-verified)**
- [ ] `real_match_verify.mjs` exits 0 before every publish
- [ ] Trigger presence assertion passes (both immutability triggers)
- [ ] Forecast/result counts are monotonic across two consecutive publishes
- [ ] **Correction test runs against a copy of the ledger**, never the live one; restore the copy afterwards and confirm no bogus revision reached the published JSON
- [ ] Manual `gh workflow run` on the branch produces a no-op diff when nothing changed

**2.5 Complete forecast-to-publishing pipeline**
- [ ] Forecast generation → export → validation → commit → preview deploy runs end to end
- [ ] Weekly publish procedure documented (the §8.1 sequence)
- [ ] Manual rerun command documented and tested

**2.6 Promote to production**
- [ ] Merge the branch to `main` only if every 2.1–2.5 exit test passed
- [ ] Confirm the `main` deployment succeeds and serves the same content as the verified preview
- [ ] Enable the schedule: `gh workflow enable settlement`
- [ ] Run the workflow twice; the second run must produce an empty diff

**2.7 Post-deploy verification (first hour)**
- [ ] Production vs preview vs local: all 5 endpoints identical
- [ ] 0 functions, `noindex` present, cache headers present
- [ ] No new console errors on any page
- [ ] Rollback path confirmed ready (previous deployment available, `git revert` clean)

**Phase 2 exit tests**

| Test | Pass condition |
|---|---|
| Preview vs local | all 5 endpoints byte-identical |
| Branch isolation | branch push → preview only; production untouched |
| Production vs preview | all 5 endpoints byte-identical after merge |
| Functions | 0 |
| Cache headers | `public, max-age=0, must-revalidate` on `/api/*` |
| Live states | all 4 rendered correctly, no error page |
| Correction | revision increments, history retained, **live ledger untouched** |
| Idempotent rerun | empty diff, no deployment |
| Workflow enabled | `gh workflow enable settlement`; second run empty diff |
| Rollback | `git revert` and "promote previous deployment" both verified |

**Rollback:** Vercel → promote previous deployment (~30 s), or `git revert` (~2 min). Local server remains the reference.

---

### Phase 3 — Test and launch

**Goal:** prove the live system end to end, then issue a launch verdict.

**3.1 End-to-end verification**
- [ ] Every page loads with 0 console errors and no 4xx/5xx
- [ ] Every nav link resolves; no dead links
- [ ] Every `/api/*` endpoint returns the expected shape and counts
- [ ] All 260 scoreline grids return 200 (not 404) for their fixture ids
- [ ] Archive/history shows all 119 results; missing forecasts still labelled "Not forecast"
- [ ] Fixtures filters (`status`, `matchweek`) return correct rows
- [ ] `Cache-Control` and security headers present on the live domain
- [ ] Core Web Vitals: LCP < 2.5 s, CLS < 0.1, INP < 200 ms

**3.2 API quota and failure handling**
- [ ] Simulated 429 → `live.json` reports `unavailable`, site keeps working
- [ ] Simulated provider timeout → same
- [ ] Quota-exhausted path → results still settle from football-data.co.uk
- [ ] Workflow failure → no commit, no deploy, `last_success_at` goes stale visibly
- [ ] Delayed/skipped run → next run reconciles without duplicate rows
- [ ] Budget replay re-run against live data → ≤ 57 calls on the worst day

**3.3 Forecast and ledger integrity**
- [ ] Counts match: 260 forecasts, 119 results, 0 duplicates
- [ ] Both immutability triggers present; an `UPDATE`/`DELETE` against `forecasts` still aborts
- [ ] Late-forecast flags unchanged
- [ ] `result_revisions` history intact
- [ ] Published JSON reproducible from the DB
- [ ] No forecast, result, weight or methodology was altered by deployment

**3.4 Security and data exposure checks**
- [ ] Re-run the secret scan against the **deployed site**, not just the repo
- [ ] `GET /package.json`, `/src/`, `/screenshots/`, `/shots/`, `/qa-final/`, `/.env`, `/data/calibra.db`, `/server/app.mjs` → all **404**
- [ ] Security headers present on the live domain
- [ ] `noindex` present on every page
- [ ] No absolute local paths anywhere in the deployed payload
- [ ] `FOOTBALL_API_KEY` absent from every response body

**3.5 Responsive and browser testing**
- [ ] 5 viewports (360, 390, 768, 1024, 1440) × every page: zero horizontal overflow — run `node scripts/visual_audit.mjs`
- [ ] Interaction suite in **Chromium, Firefox and WebKit** — `tests/interaction_test.mjs` currently loops `[chromium]` only, and that gap must close here
- [ ] axe-core on every page via `node scripts/a11y_keyboard.mjs`; treat a clean run as necessary but not sufficient, and complete a manual keyboard pass
- [ ] Keyboard navigation end to end; visible focus; no traps
- [ ] Mobile touch targets ≥ 44 px
- [ ] Lighthouse desktop and mobile, both written to `baseline/lighthouse-{desktop,mobile}.json`
- [ ] Compare against the committed baseline; if no baseline exists, report **INCONCLUSIVE**, never a silent pass

**Baseline rule:** `reports/` is gitignored, so performance and a11y baselines must be committed to `baseline/` (added to `.vercelignore`). Without a committed baseline, 3.7's verdict is INCONCLUSIVE by definition.

**3.6 Recovery drill**
- [ ] `git revert` a publish commit → site returns to the previous state
- [ ] Vercel "promote previous deployment" works
- [ ] `scripts/backup_ledger.sh` restore verified
- [ ] Site renders correctly with `web/api/*.json` + `web/data/website/scorelines/` as the only data source

**3.7 Final production readiness report**
- [ ] Consolidate every result above into one report with command output quoted
- [ ] List every unverified item explicitly
- [ ] Issue a verdict: **SHIP / SHIP WITH FIXES / DO NOT SHIP** (use **INCONCLUSIVE** if a visual baseline is missing)
- [ ] Update `scripts/FINAL_ARCHITECTURE.md` status to "deployed"
- [ ] Record the weekly publish procedure and the manual rerun command

**Phase 3 exit tests:** all of the above pass, or every failure is documented with severity and an explicit ship/no-ship call.

**Rollback:** unchanged from Phase 2. Production can be reverted in under two minutes at any point.

---

## 13. Approval gates

| # | Decision | Recommendation |
|---|---|---|
| 1 | Host | Vercel Hobby |
| 2 | Database in production | **none** — static publish |
| 3 | Vercel Functions | **zero** — provider calls run in Actions |
| 4 | Live scores | best-effort snapshot, graceful degradation |
| 5 | Settlement | GitHub Actions, idempotent, verify-gated |
| 6 | Rate limiting | removed |
| 7 | New dependencies | **none** |
| 8 | Extra services | **none** |
| 9 | CI ledger source (§8.5) | **direct commit of `data/calibra.db`** — audited public-safe, WAL checkpointed |

**Three approvals, one per phase.** Each phase ends with its exit tests run, its evidence reported, and an explicit gate decision. No phase begins before the previous one is approved.

Gate 9 is settled: the ledger is committed directly and was audited as public-safe.

Reply **"approve Phase 1"** (and confirm gate 9) to begin. No implementation starts before that.

