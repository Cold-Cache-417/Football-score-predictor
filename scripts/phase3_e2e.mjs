#!/usr/bin/env node
/**
 * Phase 3 end-to-end audit.
 *
 *   node scripts/phase3_e2e.mjs [base-url]
 *
 * Checks every page for console errors, failed requests, 4xx/5xx, missing
 * images, horizontal overflow and empty data states across five viewports,
 * then verifies every internal link and the match-page empty state.
 *
 * Read-only: it never submits a form or mutates remote state.
 */
import { chromium } from "/opt/homebrew/lib/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const OUT = path.resolve(import.meta.dirname, "../reports/phase3");
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: "index", url: "/index.html" },
  { name: "fixtures", url: "/fixtures.html" },
  { name: "history", url: "/history.html" },
  { name: "match", url: "/match.html?id=m-2026-11-22-ala-dep" },
  { name: "how", url: "/how-it-works.html" },
  { name: "club", url: "/club.html?team=rma" },
  { name: "creator", url: "/creator.html" },
  { name: "404", url: "/nonexistent-page", expectStatus: 404 }
];

/* Intentional legacy redirects: the merged pages now live at their new URLs. */
const LEGACY_REDIRECTS = [
  { source: "/models.html", destination: "/how-it-works.html" },
  { source: "/performance.html", destination: "/how-it-works.html" },
  { source: "/about.html", destination: "/how-it-works.html" }
];

const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 }
];

const results = [];
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const cfg of PAGES) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const badResponses = [];
    let mainStatus = null;

    page.on("console", (msg) => {
      /* A 404 page legitimately logs the 404 for its own document. */
      if (msg.type() !== "error") return;
      if (cfg.expectStatus && msg.text().includes(String(cfg.expectStatus))) return;
      consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("requestfailed", (req) => {
      if (req.url().startsWith(BASE)) failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    });
    page.on("response", (res) => {
      if (!res.url().startsWith(BASE)) return;
      if (res.url() === `${BASE}${cfg.url}`) mainStatus = res.status();
      if (res.status() >= 400 && !(cfg.expectStatus && res.status() === cfg.expectStatus)) {
        badResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    try {
      await page.goto(`${BASE}${cfg.url}`, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(350);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const brokenImages = Array.from(document.images)
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.currentSrc || img.src);
        const note = document.getElementById("data-note");
        return {
          scrollW: doc.scrollWidth,
          clientW: doc.clientWidth,
          overflowX: doc.scrollWidth - doc.clientWidth,
          brokenImages,
          dataNoteVisible: note ? !note.hidden : false,
          dataNoteText: note ? note.textContent.trim() : null,
          fixtureRows: document.querySelectorAll("#fixture-list a, #fixture-list tr, [data-fixture-row]").length,
          bodyText: document.body.innerText.length
        };
      });

      results.push({
        viewport: vp.name,
        page: cfg.name,
        status: mainStatus,
        overflowX: metrics.overflowX,
        consoleErrors,
        pageErrors,
        failedRequests,
        badResponses,
        brokenImages: metrics.brokenImages,
        dataNoteVisible: metrics.dataNoteVisible,
        dataNoteText: metrics.dataNoteText,
        fixtureRows: metrics.fixtureRows,
        bodyText: metrics.bodyText,
        ok:
          metrics.overflowX <= 1 &&
          consoleErrors.length === 0 &&
          pageErrors.length === 0 &&
          failedRequests.length === 0 &&
          badResponses.length === 0 &&
          metrics.brokenImages.length === 0 &&
          metrics.bodyText > 100
      });
    } catch (error) {
      results.push({ viewport: vp.name, page: cfg.name, error: error.message, ok: false });
    }
    await context.close();
  }
}

/* --- Internal link integrity (desktop, once) --- */
const linkPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const links = new Set();
for (const cfg of PAGES.filter((p) => p.name !== "404")) {
  await linkPage.goto(`${BASE}${cfg.url}`, { waitUntil: "networkidle" });
  const hrefs = await linkPage.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  for (const href of hrefs) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (/^https?:\/\//.test(href) && !href.startsWith(BASE)) continue;
    links.add(new URL(href, `${BASE}${cfg.url}`).pathname + new URL(href, `${BASE}${cfg.url}`).search);
  }
}
const linkResults = [];
for (const href of [...links].sort()) {
  const res = await linkPage.request.get(`${BASE}${href}`, { maxRedirects: 0 });
  linkResults.push({ href, status: res.status(), ok: res.status() < 400 });
}
await linkPage.close();

/* --- Match page empty state --- */
const matchPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await matchPage.goto(`${BASE}/match.html?id=does-not-exist`, { waitUntil: "networkidle" });
const matchEmpty = await matchPage.evaluate(() => {
  const missing = document.getElementById("match-missing");
  const body = document.getElementById("match-body");
  return { missingVisible: missing ? !missing.hidden : false, bodyHidden: body ? body.hidden : null, title: document.title };
});
await matchPage.close();

/* --- Filter and tab interaction checks (desktop) --- */
const interactions = [];
const ip = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const countRows = () => ip.locator("#fixture-list a").count();

await ip.goto(`${BASE}/fixtures.html`, { waitUntil: "networkidle" });
interactions.push({ check: "fixtures default rows", value: await countRows(), pass: (await countRows()) > 0 });

await ip.click('#status-filter [data-status="result"]');
await ip.selectOption("#mw-filter", "all");
await ip.waitForTimeout(250);
const resultRows = await countRows();
interactions.push({ check: "fixtures results + all matchweeks = 119", value: resultRows, pass: resultRows === 119 });

await ip.fill("#fixture-search", "Real Madrid");
await ip.waitForTimeout(250);
const searchRows = await countRows();
interactions.push({ check: "fixtures search narrows rows", value: searchRows, pass: searchRows > 0 && searchRows < resultRows });

await ip.click("#reset-filters");
await ip.waitForTimeout(250);
interactions.push({ check: "fixtures reset restores rows", value: await countRows(), pass: (await countRows()) > 0 });

await ip.goto(`${BASE}/history.html`, { waitUntil: "networkidle" });
await ip.selectOption("#mw-filter", "all");
await ip.waitForTimeout(250);
const historyRows = await countRows();
interactions.push({ check: "history results + all matchweeks = 119", value: historyRows, pass: historyRows === 119 });

await ip.goto(`${BASE}/how-it-works.html`, { waitUntil: "networkidle" });
for (const id of ["tab-blend", "tab-dc", "tab-cat", "tab-market"]) {
  await ip.click(`#${id}`);
  await ip.waitForTimeout(120);
  const selected = await ip.getAttribute(`#${id}`, "aria-selected");
  const panelText = (await ip.locator("#model-spotlight").innerText()).trim().length;
  interactions.push({ check: `models ${id}`, value: `${selected}/${panelText} chars`, pass: selected === "true" && panelText > 20 });
}

await ip.goto(`${BASE}/how-it-works.html`, { waitUntil: "networkidle" });
for (const id of ["metric-tab-accuracy", "metric-tab-rps", "metric-tab-logloss"]) {
  await ip.click(`#${id}`);
  await ip.waitForTimeout(150);
  const selected = await ip.getAttribute(`#${id}`, "aria-selected");
  const panelText = (await ip.locator("#metric-chart-panel").innerText()).trim().length;
  interactions.push({ check: `performance ${id}`, value: `${selected}/${panelText} chars`, pass: selected === "true" && panelText > 20 });
}
await ip.close();

await browser.close();

const summary = {
  base: BASE,
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS.map((v) => v.name),
  pages: PAGES.map((p) => p.name),
  runs: results.length,
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok),
  links: { total: linkResults.length, broken: linkResults.filter((l) => !l.ok) },
  interactions,
  matchEmpty
};

writeFileSync(path.join(OUT, "e2e.json"), JSON.stringify(summary, null, 2));

console.log(`Phase 3 E2E — ${BASE}`);
console.log(`Runs: ${summary.runs} (${PAGES.length} pages × ${VIEWPORTS.length} viewports)  passed: ${summary.passed}  failed: ${summary.failed.length}`);
if (summary.failed.length) {
  for (const f of summary.failed) {
    console.log(`\nFAIL ${f.page} @ ${f.viewport}px${f.error ? ` — ${f.error}` : ""}`);
    if (f.overflowX > 1) console.log(`  overflowX: ${f.overflowX}px`);
    if (f.consoleErrors?.length) console.log(`  console: ${f.consoleErrors.join(" | ")}`);
    if (f.pageErrors?.length) console.log(`  pageerror: ${f.pageErrors.join(" | ")}`);
    if (f.failedRequests?.length) console.log(`  requestfailed: ${f.failedRequests.join(" | ")}`);
    if (f.badResponses?.length) console.log(`  http>=400: ${f.badResponses.join(" | ")}`);
    if (f.brokenImages?.length) console.log(`  broken images: ${f.brokenImages.join(" | ")}`);
    if (f.dataNoteVisible) console.log(`  data-note visible: ${f.dataNoteText}`);
  }
}
console.log(`\nLinks checked: ${summary.links.total}  broken: ${summary.links.broken.length}`);
for (const b of summary.links.broken) console.log(`  BROKEN ${b.status} ${b.href}`);
console.log(`\nMatch empty state: ${JSON.stringify(matchEmpty)}`);
const failedInteractions = interactions.filter((i) => !i.pass);
console.log(`\nInteractions: ${interactions.length - failedInteractions.length}/${interactions.length} passed`);
for (const i of interactions) console.log(`  ${i.pass ? "PASS" : "FAIL"} ${i.check} — ${i.value}`);

/* --- intentional legacy redirects --- */
const redirectResults = [];
for (const r of LEGACY_REDIRECTS) {
  const res = await fetch(`${BASE}${r.source}`, { redirect: "manual" });
  redirectResults.push({ source: r.source, destination: r.destination, status: res.status, location: res.headers.get("location") });
}
const failedRedirects = redirectResults.filter((r) => r.status !== 308 || (r.location || "").replace(/^https?:\/\/[^/]+/, "") !== r.destination);
console.log(`\nLegacy redirects: ${redirectResults.length - failedRedirects.length}/${redirectResults.length} passed`);
for (const r of redirectResults) {
  const ok = r.status === 308 && (r.location || "").replace(/^https?:\/\/[^/]+/, "") === r.destination;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${r.source} -> ${r.destination} (HTTP ${r.status} -> ${r.location})`);
}

console.log(`\nReport: ${path.join(OUT, "e2e.json")}`);

process.exit(summary.failed.length || summary.links.broken.length || failedInteractions.length || failedRedirects.length ? 1 : 0);
