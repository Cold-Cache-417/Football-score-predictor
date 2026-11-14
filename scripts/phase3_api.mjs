#!/usr/bin/env node
/**
 * Phase 3 data-contract audit.
 *
 *   node scripts/phase3_api.mjs <base-url> [--grids]
 *
 * Verifies endpoint shapes and counts against the committed exports and the
 * ledger, and (with --grids) fetches every scoreline grid.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const base = (process.argv[2] || "").replace(/\/$/, "");
const checkGrids = process.argv.includes("--grids");
if (!base) {
  console.error("usage: node scripts/phase3_api.mjs <base-url> [--grids]");
  process.exit(2);
}

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const fixtures = read("web/api/fixtures.json");
const ledger = read("web/api/ledger.json");
const health = read("web/api/health.json");

const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass, detail });

const getJson = async (route) => {
  const res = await fetch(base + route);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* left null */ }
  return { status: res.status, body, text };
};

/* --- fixtures --- */
{
  const { status, body } = await getJson("/api/fixtures");
  add("/api/fixtures HTTP 200", status === 200, `status=${status}`);
  const f = body?.fixtures || [];
  const results = f.filter((x) => x.status === "result").length;
  const upcoming = f.filter((x) => x.status === "upcoming").length;
  add("fixtures total = 379", f.length === 379, `got ${f.length}`);
  add("fixtures results = 119", results === 119, `got ${results}`);
  add("fixtures upcoming = 260", upcoming === 260, `got ${upcoming}`);
  add("standings = 20", (body?.standings || []).length === 20, `got ${(body?.standings || []).length}`);
  add("every fixture has p{h,d,a}", f.every((x) => x.p && ["h", "d", "a"].every((k) => typeof x.p[k] === "number")), "probability vector present");
  add("every upcoming fixture has an id", f.filter((x) => x.status === "upcoming").every((x) => x.id), "ids present");
}

/* --- ledger --- */
{
  const { status, body } = await getJson("/api/ledger");
  add("/api/ledger HTTP 200", status === 200, `status=${status}`);
  add("ledger forecasts = 260", body?.forecasts === 260, `got ${body?.forecasts}`);
  add("ledger evaluations = 0 (no join yet)", Array.isArray(body?.evaluations) && body.evaluations.length === 0, `got ${body?.evaluations?.length}`);
  add("ledger record present", body?.record && typeof body.record === "object", "record object");
}

/* --- health --- */
{
  const { status, body } = await getJson("/api/health");
  add("/api/health HTTP 200", status === 200, `status=${status}`);
  add("health forecasts = 260", body?.ledger?.forecasts === 260, `got ${body?.ledger?.forecasts}`);
  add("health results = 119", body?.ledger?.results === 119, `got ${body?.ledger?.results}`);
  add("health quota reserve = 25", body?.quota?.reserve === 25, `got ${body?.quota?.reserve}`);
  add("health quota blocked = false", body?.quota?.blocked === false, `got ${body?.quota?.blocked}`);
}

/* --- bootstrap --- */
{
  const res = await fetch(base + "/api/bootstrap.js");
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* noop */ }
  add("/api/bootstrap.js parses", res.status === 200 && parsed !== null, `status=${res.status}`);
  add("bootstrap fixtures = 379", parsed?.fixtures?.length === 379, `got ${parsed?.fixtures?.length}`);
}

/* --- committed-export equality (volatile fields stripped) --- */
{
  const VOLATILE = new Set(["generatedAt", "resultsUpdatedAt", "predictionsUpdatedAt", "scheduleUpdatedAt", "live"]);
  const strip = (o) => {
    const sort = (v) => {
      if (Array.isArray(v)) return v.map(sort);
      if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v).sort()) {
          if (VOLATILE.has(k)) continue;
          out[k] = sort(v[k]);
        }
        return out;
      }
      return v;
    };
    return JSON.stringify(sort(o));
  };
  const committed = [
    ["/api/fixtures", "web/api/fixtures.json"],
    ["/api/ledger", "web/api/ledger.json"]
  ];
  for (const [route, file] of committed) {
    const { body } = await getJson(route);
    add(`${route} equals ${file}`, strip(body) === strip(read(file)), "semantic equality");
  }
  // /api/health mixes runtime-only state (startedAt, provider, live) with the
  // stable contract (ok, ledger, quota, data) that the published snapshot carries.
  // Compare the shared stable fields only; never the runtime-specific ones.
  const healthLive = await getJson("/api/health");
  const healthStatic = read("web/api/health.json");
  const stableHealth = (v) => {
    const out = { ok: v && typeof v === "object" ? v.ok === true : false, ledger: v && typeof v === "object" ? v.ledger : null };
    const quota = v && typeof v === "object" ? v.quota : null;
    out.quota = { reserve: quota && quota.reserve, blocked: quota && quota.blocked };
    out.hasData = Boolean(v && typeof v === "object" && v.data && typeof v.data === "object");
    return out;
  };
  const healthLiveStable = stableHealth(healthLive.body);
  const healthStaticStable = stableHealth(healthStatic);
  add(
    "/api/health equals web/api/health.json (stable fields)",
    JSON.stringify(healthLiveStable) === JSON.stringify(healthStaticStable),
    `semantic equality (ok=${healthLiveStable.ok}, ledger=${JSON.stringify(healthLiveStable.ledger)}, quota.reserve=${healthLiveStable.quota.reserve}, data=${healthLiveStable.hasData})`
  );
}

/* --- scoreline grids --- */
if (checkGrids) {
  const dir = path.join(ROOT, "web/data/website/scorelines");
  const ids = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  let ok = 0;
  const bad = [];
  const concurrency = 20;
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const statuses = await Promise.all(
      batch.map(async (id) => {
        const res = await fetch(`${base}/data/website/scorelines/${id}.json`);
        if (res.ok) {
          const body = await res.json().catch(() => null);
          return { id, ok: Boolean(body), status: res.status };
        }
        return { id, ok: false, status: res.status };
      })
    );
    for (const s of statuses) { if (s.ok) ok += 1; else bad.push(s); }
  }
  add("all 260 scoreline grids reachable", ok === 260, `${ok}/260`);
  if (bad.length) add("grid failures", false, bad.slice(0, 5).map((b) => `${b.id}:${b.status}`).join(", "));
}

const failed = checks.filter((c) => !c.pass);
console.log(`Phase 3 data contract — ${base}`);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}  (${c.detail})`);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
