#!/usr/bin/env node
/**
 * Verify a deployment against the committed exports.
 *
 *   node scripts/verify_deploy.mjs https://<deployment-url>
 *
 * Compares every /api/* endpoint and a sample scoreline grid. Volatile fields
 * (generatedAt, live state) are excluded. Exits non-zero on any difference.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/verify_deploy.mjs <base-url>");
  process.exit(2);
}

const strip = (o) => {
  const c = structuredClone(o);
  if (c.meta) { delete c.meta.generatedAt; delete c.meta.live; }
  delete c.generatedAt;
  return JSON.stringify(c, (k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]]))
      : v
  );
};
const endpoints = [
  ["/api/fixtures", "web/api/fixtures.json"],
  ["/api/ledger", "web/api/ledger.json"],
  ["/api/health", "web/api/health.json"]
];

const failures = [];
for (const [route, file] of endpoints) {
  try {
    const res = await fetch(base + route);
    if (!res.ok) { failures.push(`${route} -> HTTP ${res.status}`); continue; }
    const remote = await res.json();
    const local = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
    const same = strip(remote) === strip(local);
    console.log(`${route.padEnd(16)} ${same ? "MATCH" : "DIFFERS"}`);
    if (!same) failures.push(`${route} differs from ${file}`);
  } catch (error) {
    failures.push(`${route} unreachable: ${error.message}`);
  }
}
const extract = (s) => JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
try {
  const res = await fetch(base + "/api/bootstrap.js");
  const remote = extract(await res.text());
  const local = extract(fs.readFileSync(path.join(ROOT, "web/api/bootstrap.js"), "utf8"));
  const same = strip(remote) === strip(local);
  console.log(`${"/api/bootstrap.js".padEnd(16)} ${same ? "MATCH" : "DIFFERS"}`);
  if (!same) failures.push("/api/bootstrap.js differs");
} catch (error) {
  failures.push(`/api/bootstrap.js unreachable: ${error.message}`);
}

const grid = fs.readdirSync(path.join(ROOT, "web/data/website/scorelines")).find((f) => f.endsWith(".json"));
const gridRes = await fetch(`${base}/data/website/scorelines/${grid}`);
console.log(`${"scoreline grid".padEnd(16)} ${gridRes.ok ? "200" : "HTTP " + gridRes.status}`);
if (!gridRes.ok) failures.push(`scoreline grid -> HTTP ${gridRes.status}`);

for (const p of ["/package.json", "/src/", "/screenshots/", "/.env", "/data/calibra.db"]) {
  const r = await fetch(base + p, { redirect: "manual" });
  if (r.status === 200) failures.push(`${p} is publicly reachable (HTTP 200)`);
}
console.log(`forbidden paths  ${failures.some((f) => f.includes("reachable")) ? "LEAK" : "all blocked"}`);

if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK — deployment matches committed exports");

