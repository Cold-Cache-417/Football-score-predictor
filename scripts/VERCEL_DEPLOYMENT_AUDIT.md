> **SUPERSEDED.** Several findings in this audit were wrong (notably the libSQL trigger claim
> and the "Upstash/KV/Blob are required" conclusion). See `scripts/FINAL_ARCHITECTURE.md`
> for the verified, final recommendation. Kept for history only.

# VERCEL DEPLOYMENT — PRODUCTION RISK AUDIT

**Audit Date:** 2026-11-12  
**Auditor:** OpenCode (ponytail + deployment-patterns + database-migrations)  
**Status:** NOT READY — 7 blocking risks identified

---

## EXECUTIVE SUMMARY

The original plan (3.25h) is **unrealistic** for production deployment.  
**Revised estimate: 6-8 hours** with proper risk mitigation.  
**7 blocking risks** must be resolved before approval.

---

## 1. TURSO/LIBSQL COMPATIBILITY — 🔴 BLOCKING

### Current SQLite Features Used

| Feature | In Schema? | libSQL Support | Notes |
|---------|------------|----------------|-------|
| `CREATE TRIGGER ... BEFORE UPDATE/DELETE` | ✅ Yes (2 triggers) | ❌ **NOT SUPPORTED** | libSQL does not support triggers (issue #1523) |
| `RAISE(ABORT, ...)` | ✅ Yes | ❌ **NOT SUPPORTED** | SQLite-specific |
| `AUTOINCREMENT` | ⚠️ No (uses PK) | ✅ Supported | Not used |
| `CHECK` constraints | ⚠️ No | ✅ Supported | Not used |
| `datetime('now')` | ⚠️ No | ✅ Supported | Not used |
| `CONCURRENTLY` indexes | ❌ Not in schema | N/A | SQLite doesn't support this either |
| Transactions (`BEGIN/COMMIT`) | ⚠️ In app code | ✅ Supported | Via `db.transaction()` |

### Critical Finding: **FORECAST IMMUTABILITY TRIGGERS WILL NOT WORK ON TURSO**

The two triggers enforcing forecast immutability (`forecasts_no_update`, `forecasts_no_delete`) **will not be created** on libSQL. They will silently fail or be ignored.

### Mitigation Options (choose one):

| Option | Effort | Risk |
|--------|--------|------|
| **A. Application-level enforcement** | Low | Medium — must audit all code paths |
| **B. Neon (PostgreSQL) instead of Turso** | Medium | Low — full trigger support |
| **C. PlanetScale (MySQL) + application enforcement** | Medium | Medium |
| **D. Keep SQLite locally, proxy via Vercel Edge** | Low | High — complex, defeats purpose |

**Recommendation:** Switch to **Neon (PostgreSQL)** — full trigger/transaction support, serverless-native, generous free tier. Adds ~30 min to migration.

---

## 2. RATE LIMITING ACROSS VERCEL INSTANCES — 🔴 BLOCKING

### Current Architecture (Broken in Serverless)

```javascript
// server/index.mjs — IN-MEMORY MAP, PER PROCESS
const buckets = new Map();

function rateLimited(ip) {
  const bucket = buckets.get(ip);  // ← Each Vercel instance has own Map
  // ...
}
```

### Problem

- **Vercel spins up N instances** based on traffic
- Each instance has **isolated memory** → `buckets` not shared
- Effective rate limit = `120 req/min × N instances`
- Under load: N can be 10-50+ → effective limit 1,200-6,000 req/min
- **Attacker can bypass by distributing across instances**

### Required Fix: **External Rate Limit Store**

| Option | Complexity | Latency | Cost |
|--------|------------|---------|------|
| **Vercel Edge Middleware + KV** | Low | ~5ms | Free tier: 100k reads/day |
| **Upstash Redis (REST)** | Low | ~10ms | Free: 10k commands/day |
| **Turso/Neon table** | Medium | ~20ms | Free tier |
| **Custom in-memory with sync** | High | N/A | Don't do this |

**Recommendation:** **Upstash Redis** via REST API — simple, fast, free tier sufficient for 100 req/min.

```javascript
// Edge Middleware example (runs before function)
import { kv } from '@vercel/kv';

export default async function middleware(request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const key = `ratelimit:${ip}:${Math.floor(Date.now() / 60000)}`;
  const count = await kv.incr(key);
  if (count === 1) await kv.expire(key, 60);
  if (count > 120) return new Response('Too Many Requests', { status: 429 });
}
```

**Adds:** ~30 min to implementation.

---

## 3. FORECAST IMMUTABILITY UNDER CONCURRENCY — 🟡 HIGH RISK

### Current Guarantee

```sql
CREATE TRIGGER forecasts_no_update
BEFORE UPDATE ON forecasts
BEGIN
  SELECT RAISE(ABORT, 'forecasts are immutable');
END;
```

### Serverless Risk

- **No triggers on libSQL/Neon without explicit support**
- Concurrent `insertForecasts` calls could race
- Current code uses `INSERT OR IGNORE` which is safe for PK conflicts
- But `UPDATE` paths must be audited

### Required Fixes

| Path | Current | Serverless Fix |
|------|---------|----------------|
| `insertForecasts` | `INSERT OR IGNORE` | ✅ Safe (PK conflict) |
| `ledger-sync.mjs` upserts | `ON CONFLICT` | ✅ Safe if using `ON CONFLICT` |
| Any `UPDATE forecasts` | Blocked by trigger | **Must add application check** |

**Application-level check required:**
```javascript
// In insertForecasts / ledger-sync
const existing = await db.execute('SELECT 1 FROM forecasts WHERE pair_key = ?', [pairKey]);
if (existing.rows.length > 0) {
  return { inserted: 0, skipped: 1, reason: 'immutable' };
}
```

**Adds:** ~15 min to implementation.

---

## 4. BACKUP, ROLLBACK & MIGRATION VERIFICATION — 🔴 BLOCKING

### Current State: **No Procedures Defined**

| Procedure | Current | Required for Production |
|-----------|---------|------------------------|
| **Schema migration** | Manual SQL dump | Automated, versioned, tested |
| **Data backup** | File copy (`cp data/calibra.db`) | Automated daily + on-demand |
| **Rollback** | None | One-command revert |
| **Migration verification** | Manual `sqlite3` query | Automated test suite |
| **Point-in-time recovery** | None | WAL + scheduled snapshots |

### Required for Production (Neon/Turso)

| Procedure | Implementation |
|-----------|----------------|
| **Schema migrations** | `drizzle-kit` or `kysely` migration files (versioned in git) |
| **Backup** | Neon: PITR automatic; Turso: `turso db shell` dump cron |
| **Rollback** | Neon: Branch + promote; Turso: Restore from dump |
| **Verification** | `npm run db:verify` — runs test queries against staging DB |
| **Smoke test** | Post-deploy: `curl /api/health`, `curl /api/fixtures` count |

**Adds:** ~45 min to document + implement migration framework.

---

## 5. BOOTSTRAP ENDPOINT SECURITY — 🟡 HIGH RISK

### Current Exposure

```
/api/bootstrap.js → Returns FULL payload:
- All 379 fixtures (with probabilities, xG, market prices)
- All 119 results (with scores)
- Team data (crests, names)
- Live feed state
- League metadata
```

### Risks

- **No authentication** — anyone can fetch full dataset
- **Large payload** (~260 KB) — bandwidth cost
- **Cacheable** — `cache-control: no-store` but Vercel Edge may cache
- **Exposes market probabilities** — proprietary model data

### Required Fixes

| Fix | Implementation |
|-----|----------------|
| **Rate limit** | Apply same 120/min to `/api/bootstrap.js` |
| **Optional auth** | `?key=...` or header for internal use |
| **CORS** | Restrict to `calibra.vercel.app` only |
| **Cache control** | `no-store, must-revalidate, private` |
| **Payload size** | Consider pagination or field filtering (`?fields=...`) |

**Adds:** ~15 min.

---

## 6. LIVE SETTLEMENT & IDEMPOTENCY IN SERVERLESS — 🟡 HIGH RISK

### Current Flow (Persistent Server)

```
refreshResults() → buildSeasonResults() → resultsToCsv() 
  → write FILES.results (CSV) 
  → syncLedgerFromDisk() 
  → openLedger() 
  → INSERT INTO results + result_revisions
  → recordResult() with revision bump
```

### Serverless Risks

| Risk | Impact |
|------|--------|
| **CSV file write** (`fs.writeFileSync`) | ❌ Ephemeral FS — lost on next invocation |
| **Interval timer** (`setInterval`) | ❌ Doesn't work in serverless (process dies) |
| **In-memory live cache** (`liveCache`, `recentCache`) | ❌ Lost between invocations |
| **Idempotent settlement** | ✅ `recordResult` uses `ON CONFLICT` / revision — works if DB accessible |

### Required Refactor

| Component | Current | Serverless Replacement |
|-----------|---------|------------------------|
| **Results refresh** | `setInterval` in `index.mjs` | **Vercel Cron Job** (cron: `*/15 * * * *`) → calls `/api/refresh-results` |
| **CSV persistence** | Local file `data/raw/results.csv` | **DB table `external_results`** or **Vercel Blob** |
| **Live feed cache** | In-memory `liveCache` | **Upstash Redis / Vercel KV** with TTL |
| **Recent results cache** | In-memory `recentCache` | **Vercel KV** with TTL |
| **Provider quota** | Local JSON file | **DB table `provider_quota`** or **Vercel KV** |

**Adds:** ~90 min — this is the largest refactor.

---

## 7. FUNCTIONALITY LOST — 🟡 MEDIUM RISK

| Feature | Current | Serverless | Notes |
|---------|---------|------------|-------|
| **Persistent DB connection** | ✅ Single handle | ❌ New connection per request (pooling) | Add connection pooling |
| **In-memory rate limit** | ✅ Shared Map | ❌ External store needed | Upstash Redis |
| **In-memory live/result cache** | ✅ Module-level | ❌ External KV | Vercel KV / Upstash |
| **CSV file persistence** | ✅ Local disk | ❌ Ephemeral | DB table or Blob |
| **Interval timers** | ✅ `setInterval` | ❌ Cron jobs | Vercel Cron |
| **Gzip compression** | ✅ `zlib.gzipSync` | ✅ Native | Vercel handles |
| **Signal handling** (SIGTERM) | ✅ Graceful close | ⚠️ Max 10s | Not needed |
| **File descriptor reuse** | ✅ Single handle | ⚠️ Per-request | Connection pooling |

**Lost but replaceable:** All of the above have serverless equivalents.

---

## UPDATED IMPLEMENTATION PLAN (REVISED)

### Phase 0: DB Decision & Setup (45 min)
- [ ] Choose: **Neon (PostgreSQL)** — full trigger/transaction support
- [ ] Create Neon project, get connection string
- [ ] Set `DATABASE_URL` in Vercel env

### Phase 1: Schema Migration (60 min)
- [ ] Export SQLite schema → PostgreSQL dialect
- [ ] **Recreate triggers as CHECK constraints or application logic**
- [ ] `forecasts`: Add `CHECK (generated_at IS NOT NULL)` + app-level immutability
- [ ] `results`: Keep `result_revisions` table
- [ ] Run migration via `drizzle-kit` or raw SQL
- [ ] Verify data integrity: counts, triggers simulated

### Phase 2: DB Client Refactor (30 min)
- [ ] Replace `sqlite3` → `postgres` (Neon serverless driver) or `kysely` + `pg`
- [ ] Update all queries in `db.mjs`, `data.mjs`, `ledger-sync.mjs`
- [ ] Test: `npm test` passes

### Phase 3: Serverless API Conversion (90 min)
- [ ] Create `api/` with 5 endpoints
- [ ] Refactor `data.mjs`: remove globals, pass `db` param
- [ ] Add rate limiting middleware (Upstash Redis)
- [ ] Add CORS, security headers
- [ ] Test each endpoint locally with `vercel dev`

### Phase 4: Background Jobs (60 min)
- [ ] Create `/api/refresh-results` endpoint
- [ ] Add Vercel Cron: `*/15 * * * *` → `/api/refresh-results`
- [ ] Move CSV → DB table `external_results`
- [ ] Move provider quota → DB table `provider_quota`
- [ ] Move live/recent caches → Vercel KV / Upstash Redis

### Phase 5: Config & Deploy (30 min)
- [ ] `package.json`, `vercel.json`, `.vercelignore`
- [ ] `vercel link`, `vercel --prod`
- [ ] Set env vars in Vercel dashboard

### Phase 6: Verification (30 min)
- [ ] Smoke tests: health, fixtures, bootstrap, ledger
- [ ] Load test: 120 req/min burst → verify rate limit
- [ ] Lighthouse on production URL
- [ ] `npm test` against production DB

---

## REVISED TIME ESTIMATE

| Phase | Original | Revised | Delta |
|-------|----------|---------|-------|
| 0: DB Setup | 30 min | 45 min | +15 |
| 1: Schema Migration | 30 min | 60 min | +30 (trigger rewrite) |
| 2: DB Client | 30 min | 30 min | — |
| 3: API Conversion | 60 min | 90 min | +30 (middleware) |
| 4: Background Jobs | 30 min | 60 min | +30 (cron + KV) |
| 5: Config/Deploy | 15 min | 30 min | +15 |
| 6: Verification | 30 min | 30 min | — |
| **Total** | **3.25h** | **5.75h** | **+2.5h** |

---

## APPROVAL GATE

**Do NOT proceed until:**

1. ☐ **DB decision confirmed** (Neon recommended over Turso)
2. ☐ **Rate limiting approach approved** (Upstash Redis via Edge Middleware)
3. ☐ **Background job architecture approved** (Vercel Cron + KV)
4. ☐ **Migration verification procedure documented**
5. ☐ **Bootstrap endpoint security hardening approved**

**Reply "approve with Neon" or specify changes to proceed.**
