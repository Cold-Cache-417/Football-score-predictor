/* HTTP entry point: JSON API + static files for the concept site.

   Runs on plain Node (no dependencies) and is written as a fetch-style
   handler so the same code can be mounted behind a Worker adapter. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { buildPayload, FILES, ROOT } from "./lib/data.mjs";
import { buildEvaluations, ledgerStats, listForecasts, summarise } from "./lib/db.mjs";
import { getLiveFeed, getResultsForDate, liveConfigured, peekLive, providerInfo, quotaStatus } from "./lib/live.mjs";
import { runtime } from "./lib/runtime.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

/* Every file the site may serve comes from one of these roots. The ledger, raw
   provider inputs, reports and secrets are deliberately absent: they are not
   reachable over HTTP at all. */
const PUBLIC_ROOTS = [
  { prefix: "", root: path.join(ROOT, "web") },
  { prefix: "data/website/scorelines/", root: path.join(ROOT, "data/website/scorelines") }
];

/* The inline theme bootstrap and /api/bootstrap.js mean script-src needs
   'unsafe-inline'; everything else is locked to this origin. */
const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; " +
    "form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY"
};

function fileMtime(file) {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return null;
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
      ...SECURITY_HEADERS,
      ...extra
    }
  });
}

/** Decode a request path, refusing encoded separators, encoded dots and NUL.
    A malformed encoding is a 404, never a 500. */
function decodePath(urlPath) {
  if (/%2e|%2f|%5c|%00/i.test(urlPath)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (/[\0\\]/.test(decoded) || /%2e|%2f|%5c|%00/i.test(decoded)) return null;
  return decoded;
}

function insideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

/** Map a site-relative path to a real file, or null. Containment is checked on
    the resolved path and again on the real path, so neither `..` nor a symlink
    can leave a public root. */
function resolvePublic(relative) {
  for (const entry of PUBLIC_ROOTS) {
    if (!relative.startsWith(entry.prefix)) continue;
    const rest = relative.slice(entry.prefix.length);
    if (!rest) continue;
    const root = path.resolve(entry.root);
    const candidate = path.resolve(root, rest);
    if (!insideRoot(root, candidate)) continue;
    try {
      const real = fs.realpathSync(candidate);
      if (!insideRoot(fs.realpathSync(root), real)) continue;
      if (fs.statSync(real).isFile()) return real;
    } catch {
      continue;
    }
  }
  return null;
}

function notFound() {
  try {
    const page = fs.readFileSync(path.join(ROOT, "web", "404.html"));
    return new Response(page, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS }
    });
  } catch {
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  }
}

function serveStatic(urlPath) {
  const decoded = decodePath(urlPath);
  if (decoded == null) return notFound();

  let relative = decoded.replace(/^\/+/, "");
  if (!relative) relative = "index.html";
  if (relative.endsWith("/")) relative += "index.html";

  // Browsers ask for /favicon.ico regardless of the <link> tag; answer quietly.
  if (relative === "favicon.ico") return new Response(null, { status: 204, headers: SECURITY_HEADERS });

  const absolute = resolvePublic(relative);
  if (!absolute) return notFound();
  const stat = fs.statSync(absolute);
  const type = MIME[path.extname(absolute).toLowerCase()] || "application/octet-stream";
  const body = fs.readFileSync(absolute);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "no-cache",
      "last-modified": stat.mtime.toUTCString(),
      ...SECURITY_HEADERS
    }
  });
}

/** Merge provider-confirmed results into a small on-disk file so they survive
    a restart: the live response cache alone is not durable. */
function persistProviderResults(matches) {
  if (!matches.length) return;
  let payload = { matches: [] };
  try {
    payload = JSON.parse(fs.readFileSync(FILES.providerResults, "utf8"));
  } catch {
    payload = { matches: [] };
  }
  const byPair = new Map((payload.matches || []).map((match) => [`${match.home}|${match.away}`, match]));
  for (const match of matches) {
    const previous = byPair.get(`${match.home}|${match.away}`);
    // A corrected score from the provider replaces the earlier one.
    if (!previous || previous.homeGoals !== match.homeGoals || previous.awayGoals !== match.awayGoals) {
      byPair.set(`${match.home}|${match.away}`, match);
    }
  }
  try {
    fs.mkdirSync(path.dirname(FILES.providerResults), { recursive: true });
    fs.writeFileSync(
      FILES.providerResults,
      JSON.stringify({ updatedAt: new Date().toISOString(), matches: [...byPair.values()] }, null, 1)
    );
  } catch (error) {
    console.warn(`[provider] could not persist results: ${error.message}`);
  }
}

/** Live matches plus the recent-results reconciliation used by /api/fixtures. */
async function reconcile(payload) {
  if (!liveConfigured()) return [];
  const candidates = new Set();
  for (const fixture of payload.fixtures) {
    if (fixture.status !== "upcoming" || !fixture.awaitingResult) continue;
    // API-Football's free plan serves today +/- one day only.
    for (const offset of [-1, 0, 1]) {
      const day = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
      if (fixture.day === day) candidates.add(day);
    }
  }
  const found = [];
  for (const day of candidates) {
    const result = await getResultsForDate(day);
    for (const match of result.matches || []) found.push(match);
  }
  return found;
}

/* One long-lived ledger connection, installed by index.mjs at boot. Opening a
   DatabaseSync per request leaked file descriptors; reads now share this handle
   and none is ever opened on the request path. */
let ledgerReader = null;
export function setLedgerReader(db) {
  ledgerReader = db;
}

/* The fixtures payload only changes when a source file or the live cache does,
   so rebuilding it per request (263 KB of JSON, ~15 ms CPU) was waste. Cache it
   against a stamp of its inputs and answer conditional requests with 304. */
let fixturesEntry = null;

function fileStamp() {
  const parts = [];
  for (const key of ["results", "predictions", "schedule", "providerResults"]) {
    try {
      parts.push(`${key}:${fs.statSync(FILES[key]).mtimeMs}`);
    } catch {
      parts.push(`${key}:0`);
    }
  }
  const live = peekLive();
  parts.push(`live:${live.updatedAt || "none"}:${live.matches || 0}:${live.state}`);
  return parts.join("|");
}

async function fixturesResponse(request) {
  const stamp = fileStamp();
  if (!fixturesEntry || fixturesEntry.stamp !== stamp) {
    const live = await getLiveFeed();
    const base = buildPayload({ liveFeed: live });
    const recent = await reconcile(base);
    if (recent.length) persistProviderResults(recent);
    const payload = recent.length ? buildPayload({ liveFeed: live, recentResults: recent }) : base;
    const body = JSON.stringify(payload);
    fixturesEntry = {
      stamp: fileStamp(),
      body,
      etag: `"${crypto.createHash("sha1").update(body).digest("hex").slice(0, 20)}"`
    };
  }
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=30, must-revalidate",
    etag: fixturesEntry.etag,
    ...SECURITY_HEADERS
  };
  if (request.headers.get("if-none-match") === fixturesEntry.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(fixturesEntry.body, { status: 200, headers });
}

export async function handler(request) {
  const url = new URL(request.url);
  const route = url.pathname;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "content-type": "text/plain; charset=utf-8",
        ...SECURITY_HEADERS
      }
    });
  }

  if (route === "/api/health") {
    const ledger = ledgerReader ? ledgerStats(ledgerReader) : null;
    return json({
      ok: true,
      startedAt: runtime.startedAt,
      provider: { ...providerInfo(), quota: quotaStatus() },
      live: peekLive(),
      ledger,
      data: {
        resultsUpdatedAt: fileMtime(FILES.results),
        predictionsUpdatedAt: fileMtime(FILES.predictions),
        lastResultsRefresh: runtime.lastRefresh
      }
    });
  }

  if (route === "/api/live") {
    const feed = await getLiveFeed();
    return json({ provider: providerInfo(), ...feed });
  }

  if (route === "/api/ledger") {
    if (!ledgerReader) return json({ error: "ledger unavailable" }, 503);
    const season = url.searchParams.get("season") || "2026/27";
    if (!/^\d{4}\/\d{2}$/.test(season)) {
      return json({ error: "season must look like 2026/27" }, 400);
    }
    try {
      const db = ledgerReader;
      const evaluations = buildEvaluations(db, { season });
      const forecasts = listForecasts(db, { season });
      return json({
        season,
        record: summarise(evaluations),
        forecasts: forecasts.length,
        settled: evaluations.length,
        evaluations
      });
    } catch (error) {
      return json({ error: `ledger unavailable: ${error.message}` }, 503);
    }
  }

  if (route === "/api/fixtures") return fixturesResponse(request);

  if (route === "/api/bootstrap.js") {
    const live = await getLiveFeed();
    const payload = buildPayload({ liveFeed: live });
    const body = `/* generated at request time from the pipeline exports; never cached */\nwindow.CALIBRA_BOOTSTRAP = ${JSON.stringify(payload)};\n`;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store, must-revalidate",
        ...SECURITY_HEADERS
      }
    });
  }

  if (route.startsWith("/api/")) return json({ error: "Unknown endpoint" }, 404);

  return serveStatic(route);
}
