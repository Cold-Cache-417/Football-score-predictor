# VERCEL DEPLOYMENT PLAN — Calibra La Liga Prediction Platform

**Approach:** Ponytail (minimal necessary changes)  
**Target:** Full platform on Vercel (static frontend + serverless API + external DB)  
**DB Migration:** SQLite → Turso (libSQL, HTTP API, edge-compatible)  
**Timeline:** ~3-4 hours of focused work  
**Risk:** Medium — schema migration + serverless conversion + Vercel config

---

## PHASE 0: PREREQUISITES (Do First)

### 0.1 Create Turso Database
```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login

# Create database (libSQL = SQLite over HTTP)
turso db create calibra
turso db show calibra --url  # note: libsql://...
turso db tokens create calibra --expiration never  # note: token
```

### 0.2 Set Environment Variables
```bash
# Vercel project settings → Environment Variables
TURSO_DATABASE_URL=libsql://calibra-xxxx.turso.io
TURSO_AUTH_TOKEN=xxxx
RATE_LIMIT_PER_MIN=120
NODE_ENV=production
```

---

## PHASE 1: DATABASE MIGRATION (SQLite → Turso)

### 1.1 Export Current Schema + Data
```bash
cd /Users/luqmankhan/Projects/Football-score-predictor

# Dump schema
sqlite3 data/calibra.db .schema > scripts/calibra_schema.sql

# Dump data as INSERTs
sqlite3 data/calibra.db .dump > scripts/calibra_data.sql
```

### 1.2 Adjust Schema for Turso (libSQL)
- Remove `CONCURRENTLY` index options (not supported)
- `AUTOINCREMENT` → just `INTEGER PRIMARY KEY`
- `CHECK` constraints work
- Triggers work but test carefully
- `datetime('now')` → use `CURRENT_TIMESTAMP`

### 1.3 Import to Turso
```bash
turso db shell calibra < scripts/calibra_schema_turso.sql
turso db shell calibra < scripts/calibra_data.sql
```

### 1.4 Update DB Client Code
**File:** `server/lib/db.mjs`
- Replace `sqlite3.Database` with `@libsql/client` HTTP client
- All queries remain the same (libSQL is SQLite-compatible)
- Connection: `createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })`

**Risk:** Turso has 1s query timeout on free tier; complex joins may need optimization.

---

## PHASE 2: SERVERLESS API CONVERSION

### 2.1 Create `api/` Directory Structure
```
api/
├── fixtures.js      # GET /api/fixtures
├── health.js        # GET /api/health
├── live.js          # GET /api/live
├── ledger.js        # GET /api/ledger
└── bootstrap.js     # GET /api/bootstrap.js
```

### 2.2 Convert Each Route (Ponytail: minimal changes)
**Pattern for each file:**
```javascript
// api/fixtures.js
import { createClient } from '@libsql/client';
import { buildPayload } from '../server/lib/data.mjs';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting (in-memory per instance, fine for serverless)
  // ... reuse existing logic from server/app.mjs

  // ETag logic
  // ... reuse from server/app.mjs

  if (req.url === '/api/fixtures') {
    const payload = await buildPayload({ db });  // pass db to data.mjs
    // ... rest of fixturesResponse logic
    return res.status(200).json(payload);
  }

  return res.status(404).json({ error: 'Not found' });
}
```

### 2.3 Refactor `server/lib/data.mjs`
- Remove global `C` state
- Accept `db` as parameter in all functions
- Return data, don't set globals

### 2.4 Static Files
- `web/` → Vercel serves automatically from `/` 
- Add `vercel.json` with rewrites:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/web/$1" },
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ],
  "headers": [
    { "source": "/api/(.*)", "headers": [{ "key": "Access-Control-Allow-Origin", "value": "*" }] }
  ]
}
```

---

## PHASE 3: PACKAGE.JSON + BUILD

### 3.1 Create `package.json`
```json
{
  "name": "calibra",
  "private": true,
  "scripts": {
    "dev": "vercel dev",
    "build": "echo 'Static build — no compilation needed'",
    "test": "node --test tests/*.test.mjs && python -m pytest tests -q",
    "db:migrate": "node scripts/migrate-to-turso.mjs"
  },
  "dependencies": {
    "@libsql/client": "^0.6.0"
  },
  "devDependencies": {
    "vercel": "^34.0.0"
  }
}
```

### 3.2 Update `.gitignore` for Vercel
Add: `.vercel/`, `*.tsbuildinfo`

---

## PHASE 4: VERCEL DEPLOYMENT

### 4.1 Install Vercel CLI & Login
```bash
npm i -g vercel@latest
vercel login
```

### 4.2 Link Project
```bash
cd /Users/luqmankhan/Projects/Football-score-predictor
vercel link
# Select: "Create new project" → "Calibra"
```

### 4.3 Deploy Preview
```bash
vercel
# Test preview URL
```

### 4.4 Deploy Production
```bash
vercel --prod
```

---

## PHASE 5: VERIFICATION

### 5.1 Automated Checks
```bash
# Health
curl https://calibra.vercel.app/api/health

# Fixtures
curl https://calibra.vercel.app/api/fixtures | jq '.fixtures | length'

# ETag/304
curl -I https://calibra.vercel.app/api/fixtures
curl -H "If-None-Match: <etag>" -I https://calibra.vercel.app/api/fixtures

# Frontend
curl -I https://calibra.vercel.app/index.html
curl -I https://calibra.vercel.app/history.html
```

### 5.2 Lighthouse on Production
```bash
lighthouse https://calibra.vercel.app --form-factor mobile --output json
```

### 5.3 Test Suite
```bash
npm test
```

---

## RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Turso query timeout (1s free tier) | Medium | High | Add query timeout handling; optimize indexes |
| Serverless cold starts | Low | Low | Acceptable for internal dashboard |
| SQLite → libSQL compatibility | Low | High | Test all queries locally with Turso CLI first |
| Rate limiting per-instance | Medium | Medium | Use Vercel Edge Middleware or accept per-instance |
| Vercel function timeout (10s hobby) | Low | Medium | API responses are fast (<100ms) |
| Static file serving | Low | Low | `web/` served automatically |

---

## ESTIMATED TIME BREAKDOWN

| Task | Hours |
|------|-------|
| Turso setup + schema migration | 0.5 |
| DB client refactor | 0.5 |
| Serverless API conversion (5 routes) | 1.0 |
| `data.mjs` refactor (remove globals) | 0.5 |
| `package.json`, `vercel.json`, config | 0.25 |
| Deploy + verify + test | 0.5 |
| **Total** | **~3.25 hours** |

---

## APPROVAL NEEDED

**Approve this plan?** Reply "approve" and I'll execute Phases 0-4 sequentially with evidence at each step.

**Or specify changes:**
- Different DB (Neon, Supabase, PlanetScale)?
- Keep local server, only deploy static frontend to Vercel?
- Use Cloudflare Workers instead?
