#!/usr/bin/env node
/* Local/production server for the Calibra site.

   - serves web/ (the concept site), data/ and reports/ statically
   - /api/bootstrap.js gives the page its first paint data synchronously
   - /api/fixtures, /api/live, /api/health serve the JSON API
   - refreshes results from football-data.co.uk (free, no key) on a timer and
     once at boot, so a finished match stops being "upcoming"

   Env:
     PORT                 default 4173
     HOST                 default 127.0.0.1
     FOOTBALL_API_KEY     API-Football key (server-side only). Falls back to
                          $CALIBRA_ENV_FILE, ~/.config/calibra/env, then a
                          git-ignored .env.local/.env at the repo root. No
                          env file is served over HTTP.
     RESULTS_REFRESH_MIN  default 30 (0 disables the timer)
*/

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import zlib from "node:zlib";

import { handler, setLedgerReader } from "./app.mjs";
import { openLedger } from "./lib/db.mjs";
import { syncLedger } from "./lib/ledger-sync.mjs";
import { setApiKey, liveConfigured } from "./lib/live.mjs";
import { runtime } from "./lib/runtime.mjs";
import { buildSeasonResults, httpText, resultsToCsv, RESULTS_URL } from "./lib/results.mjs";
import { parseCsv } from "./lib/csv.mjs";
import { FILES, ROOT } from "./lib/data.mjs";

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const REFRESH_MIN = Number(process.env.RESULTS_REFRESH_MIN ?? 30);

/** Read KEY=VALUE pairs without logging any value. Secrets belong outside the
    repository: the first candidate is the recommended location. */
function loadEnvFiles() {
  if (process.env.FOOTBALL_API_KEY) return;
  const candidates = [
    process.env.CALIBRA_ENV_FILE,
    path.join(os.homedir(), ".config/calibra/env"),
    path.join(ROOT, ".env.local"),
    path.join(ROOT, ".env")
  ].filter(Boolean);
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      if (process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

/* Per-IP budget for the JSON API. Static assets are cheap and uncounted. */
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
const buckets = new Map();

function rateLimited(ip) {
  if (RATE_LIMIT <= 0) return false;
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.start >= 60_000) {
    buckets.set(ip, { start: now, count: 1 });
    if (buckets.size > 5000) {
      for (const [key, value] of buckets) if (now - value.start >= 60_000) buckets.delete(key);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

// The ledger is opened once. Forecasts are write-once; results may be corrected.
const LEDGER_FILE = path.join(ROOT, "data/calibra.db");
const ledger = openLedger(LEDGER_FILE);

// Reads go through a single read-only connection, so no request opens a handle.
let ledgerReader = ledger;
try {
  ledgerReader = openLedger(LEDGER_FILE, { readOnly: true });
} catch (error) {
  console.warn(`[ledger] read-only reader unavailable, using the writer: ${error.message}`);
}
setLedgerReader(ledgerReader);

function syncLedgerFromDisk(reason) {
  try {
    const summary = syncLedger(ledger);
    if (summary.forecasts.inserted || summary.results.new || summary.results.corrected) {
      console.log(
        `[ledger] ${reason}: ${summary.forecasts.inserted} new forecast(s), ` +
          `${summary.results.new} new result(s), ${summary.results.corrected} correction(s)`
      );
    }
    return summary;
  } catch (error) {
    console.warn(`[ledger] sync failed: ${error.message}`);
    return null;
  }
}

async function refreshResults() {
  try {
    const text = await httpText(RESULTS_URL);
    const rows = buildSeasonResults(text, parseCsv);
    if (!rows.length) throw new Error("no rows parsed");
    const csv = resultsToCsv(rows);
    let current = null;
    try {
      current = fs.readFileSync(FILES.results, "utf8");
    } catch {
      current = null;
    }
    if (current !== csv) {
      fs.writeFileSync(FILES.results, csv);
      console.log(`[results] updated ${rows.length} rows from football-data.co.uk`);
    }
    runtime.lastRefresh = { at: new Date().toISOString(), rows: rows.length, error: null };
    syncLedgerFromDisk("results refresh");
  } catch (error) {
    runtime.lastRefresh = {
      at: new Date().toISOString(),
      rows: runtime.lastRefresh.rows,
      error: error.message
    };
    console.warn(`[results] refresh failed: ${error.message}`);
  }
}

loadEnvFiles();
setApiKey(process.env.FOOTBALL_API_KEY || process.env.API_FOOTBALL_KEY || "");

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const isApi = String(req.url || "/").startsWith("/api/");
  const ip = req.socket.remoteAddress || "unknown";

  if (isApi) {
    res.on("finish", () => {
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          route: String(req.url || "/").split("?")[0],
          status: res.statusCode,
          ms: Date.now() - started
        })
      );
    });
    if (rateLimited(ip)) {
      res.writeHead(429, {
        "content-type": "text/plain; charset=utf-8",
        "retry-after": "60"
      });
      res.end("Too many requests");
      return;
    }
  }

  try {
    const origin = `http://${req.headers.host || `${HOST}:${PORT}`}`;
    // A request path of "//" or "///page" is not a valid relative URL and would
    // throw in `new URL`. Collapse the leading slashes so it resolves normally.
    const target = String(req.url || "/").replace(/^\/{2,}/, "/");
    const request = new Request(new URL(target, origin), {
      method: req.method,
      headers: req.headers
    });
    const response = await handler(request);
    const headers = Object.fromEntries(response.headers);
    if (!response.body || req.method === "HEAD") {
      res.writeHead(response.status, headers);
      res.end();
      return;
    }

    // Compress text payloads (the bootstrap is ~260 KB of JSON).
    // Reading the body consumes it, so every branch below must send the buffer
    // it already has; never fall through to streaming a locked stream.
    const acceptsGzip = /gzip/.test(String(req.headers["accept-encoding"] || ""));
    const type = String(headers["content-type"] || "");
    if (acceptsGzip && /text|json|javascript|svg|xml/.test(type)) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 1024) {
        const gzipped = zlib.gzipSync(buffer);
        headers["content-encoding"] = "gzip";
        headers["content-length"] = String(gzipped.length);
        headers.vary = "accept-encoding";
        res.writeHead(response.status, headers);
        res.end(gzipped);
        return;
      }
      headers["content-length"] = String(buffer.length);
      res.writeHead(response.status, headers);
      res.end(buffer);
      return;
    }

    res.writeHead(response.status, headers);
    const stream = Readable.fromWeb(response.body);
    stream.on("error", (error) => {
      console.error("[server] stream error:", error.message);
      res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    console.error("[server]", error);
    // Never let a failed response take the process down: a single malformed
    // request must not stop the site.
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Internal error");
    } else {
      res.destroy();
    }
  }
});

server.listen(PORT, HOST, async () => {
  console.log(`Calibra running at http://${HOST}:${PORT}/`);
  console.log(`API-Football key: ${liveConfigured() ? "configured (server-side)" : "not configured — live feed disabled"}`);
  await refreshResults();
  syncLedgerFromDisk("boot");
  if (REFRESH_MIN > 0) {
    setInterval(refreshResults, REFRESH_MIN * 60 * 1000).unref();
    console.log(`[results] auto-refresh every ${REFRESH_MIN} min`);
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      for (const db of [ledgerReader, ledger]) {
        try {
          db?.close();
        } catch {
          /* already closed */
        }
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
