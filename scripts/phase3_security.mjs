#!/usr/bin/env node
/**
 * Phase 3 deployed-site security audit.
 *
 *   node scripts/phase3_security.mjs <base-url>
 *
 * Fetches every public page, script, stylesheet and API payload, then checks
 * for secrets, local paths, forbidden paths, headers and robots directives.
 * The provider key is read only to test for its absence; it is never printed.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/phase3_security.mjs <base-url>");
  process.exit(2);
}

const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass, detail });
const PAGES = [
  { name: "index", url: "/" },
  { name: "fixtures", url: "/fixtures.html" },
  { name: "history", url: "/history.html" },
  { name: "how", url: "/how-it-works.html" },
  { name: "creator", url: "/creator.html" },
  { name: "club", url: "/club.html?team=rma" },
  { name: "match", url: "/match.html?id=m-2026-11-22-ala-dep" },
  { name: "404", url: "/nonexistent-page", expectStatus: 404 }
];

/* Approved public indexing policy: the indexable surface is "/", "/index.html",
   "/fixtures.html", "/history.html", "/how-it-works.html", "/creator.html" and
   the club pages "/club.html?team=<slug>" — that is the set the sitemap covers.
   Match, about and 404 pages are protected (noindex) and not in the sitemap. */
const PUBLIC_PATHS = new Set([
  "/", "/index.html", "/fixtures.html", "/history.html", "/how-it-works.html", "/creator.html"
]);
const PUBLIC_PREFIXES = ["/club.html"];
const PROTECTED_PATHS = ["/match.html", "/about.html", "/404.html"];

function isPublicPage(path) {
  if (PUBLIC_PATHS.has(path)) return true;
  if (PROTECTED_PATHS.includes(path)) return false;
  for (const prefix of PUBLIC_PREFIXES) if (path.startsWith(prefix)) return true;
  return false;
}

const bodies = new Map();
const fetchText = async (url) => {
  const res = await fetch(url, { redirect: "manual" });
  const text = await res.text();
  bodies.set(url, text);
  return { res, text };
};

/* ---- pages, scripts, styles, APIs ---- */
const resources = new Set(PAGES.map((p) => p.url));
for (const page of PAGES) {
  const { res, text } = await fetchText(base + page.url);
  if (!page.expectStatus) add(`page ${page.url} 200`, res.status === 200, `HTTP ${res.status}`);
  for (const match of text.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
    const href = match[1];
    if (/^https?:\/\//.test(href)) continue;
    resources.add(new URL(href, base + page.url).pathname);
  }
}
for (const api of ["/api/fixtures", "/api/ledger", "/api/health", "/api/live", "/api/bootstrap.js"]) {
  const { res } = await fetchText(base + api);
  add(`endpoint ${api} 200`, res.status === 200, `HTTP ${res.status}`);
}
for (const asset of resources) {
  if (!bodies.has(base + asset)) await fetchText(base + asset);
}

/* ---- secret and path scan ---- */
const SECRET_PATTERNS = [
  [/api[_-]?key\s*[:=]/i, "api key assignment"],
  [/bearer\s+[a-z0-9._-]{10,}/i, "bearer token"],
  [/password\s*[:=]/i, "password assignment"],
  [/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/, "private key"],
  [/ssh-rsa\s+AAAA/, "ssh key"],
  [/ghp_[A-Za-z0-9]{20,}/, "github token"],
  [/github_pat_[A-Za-z0-9_]{20,}/, "github fine-grained token"],
  [/\/Users\/[A-Za-z0-9._-]+/, "absolute local path"],
  [/\/home\/runner\//, "CI absolute path"],
  [/[A-Z]:\\\\Users\\\\/, "windows local path"]
];
const leaks = [];
for (const [url, body] of bodies) {
  for (const [rx, label] of SECRET_PATTERNS) {
    if (rx.test(body)) leaks.push(`${url}: ${label}`);
  }
}
add("no secret-like tokens in public payloads", leaks.length === 0, leaks.slice(0, 5).join(" | ") || `${bodies.size} resources scanned`);

/* ---- provider key absence (never printed) ---- */
let key = process.env.FOOTBALL_API_KEY || "";
if (!key) {
  try {
    const env = fs.readFileSync(path.join(process.env.HOME, ".config/calibra/env"), "utf8");
    key = (env.match(/^FOOTBALL_API_KEY=(.+)$/m) || [])[1]?.trim() || "";
  } catch { /* no local key file */ }
}
if (key) {
  const hits = [...bodies].filter(([, body]) => body.includes(key)).map(([url]) => url);
  add("provider key absent from every payload", hits.length === 0, hits.length ? hits.join(", ") : `key length ${key.length} not found`);
} else {
  add("provider key absence check", false, "no local key available to compare (UNVERIFIED)");
}

/* ---- forbidden paths ---- */
const FORBIDDEN = [
  "/package.json", "/package-lock.json", "/src/", "/screenshots/", "/shots/", "/qa-final/", "/.env", "/.env.local",
  "/data/calibra.db", "/server/app.mjs", "/scripts/publish_snapshot.mjs", "/.git/config", "/reports/",
  "/next.config.ts", "/tsconfig.json", "/eslint.config.mjs", "/components.json"
];
const reachable = [];
for (const p of FORBIDDEN) {
  const res = await fetch(base + p, { redirect: "manual" });
  if (res.status === 200) reachable.push(`${p} -> 200`);
}
add("forbidden paths not served", reachable.length === 0, reachable.join(", ") || `${FORBIDDEN.length} paths blocked`);

/* ---- headers ---- */
const home = await fetch(base + "/", { redirect: "manual" });
const h = home.headers;
add("CSP present", Boolean(h.get("content-security-policy")), (h.get("content-security-policy") || "missing").slice(0, 60) + "...");
add("X-Frame-Options DENY", h.get("x-frame-options") === "DENY", h.get("x-frame-options") || "missing");
add("X-Content-Type-Options nosniff", h.get("x-content-type-options") === "nosniff", h.get("x-content-type-options") || "missing");
add("Referrer-Policy set", Boolean(h.get("referrer-policy")), h.get("referrer-policy") || "missing");
const api = await fetch(base + "/api/fixtures", { redirect: "manual" });
add("API Cache-Control present", Boolean(api.headers.get("cache-control")), api.headers.get("cache-control") || "missing");

/* ---- noindex per the approved public indexing policy ---- */
const missingNoindex = [];
for (const page of PAGES) {
  const body = bodies.get(base + page.url) || "";
  const hasNoindex = /<meta[^>]+name="robots"[^>]+content="noindex/i.test(body);
  const shouldNoindex = !isPublicPage(page.url);
  if (shouldNoindex && !hasNoindex) missingNoindex.push(`${page.url} missing noindex`);
  if (!shouldNoindex && hasNoindex) missingNoindex.push(`${page.url} unexpected noindex`);
}
add("noindex matches approved public policy", missingNoindex.length === 0, missingNoindex.join(", ") || `${PAGES.length} pages checked`);

/* ---- intentional legacy redirects (merged pages) ---- */
const REDIRECTS = [
  { source: "/models.html", destination: "/how-it-works.html" },
  { source: "/performance.html", destination: "/how-it-works.html" },
  { source: "/about.html", destination: "/how-it-works.html" }
];
for (const r of REDIRECTS) {
  const res = await fetch(base + r.source, { redirect: "manual" });
  add(`redirect ${r.source} -> ${r.destination}`, res.status === 308 && (res.headers.get("location") || "").replace(/^https?:\/\/[^/]+/, "") === r.destination, `HTTP ${res.status} -> ${res.headers.get("location")}`);
}

const failed = checks.filter((c) => !c.pass);
console.log(`Phase 3 security audit — ${base}`);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}  (${c.detail})`);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
