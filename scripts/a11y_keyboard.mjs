#!/usr/bin/env node
/**
 * Phase 3 accessibility audit: axe-core on every page, keyboard reachability,
 * visible focus and mobile touch-target sizes.
 *
 *   node scripts/a11y_keyboard.mjs [base-url]
 *
 * axe-core is loaded from the locally installed Lighthouse bundle, so no new
 * dependency and no network fetch is needed.
 */
import fs from "node:fs";
import { chromium } from "/opt/homebrew/lib/node_modules/playwright/index.mjs";

const BASE = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const AXE = "/opt/homebrew/lib/node_modules/lighthouse/node_modules/axe-core/axe.min.js";
const PAGES = [
  { name: "index", url: "/index.html" },
  { name: "fixtures", url: "/fixtures.html" },
  { name: "history", url: "/history.html" },
  { name: "match", url: "/match.html?id=m-2026-11-22-ala-dep" },
  { name: "how", url: "/how-it-works.html" },
  { name: "club", url: "/club.html?team=rma" },
  { name: "creator", url: "/creator.html" },
  { name: "404", url: "/nonexistent-page" }
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const axeSource = fs.readFileSync(AXE, "utf8");
const browser = await chromium.launch();
const report = [];

for (const cfg of PAGES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}${cfg.url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  await page.addScriptTag({ content: axeSource });
  const axe = await page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" "))
    }));
  }, TAGS);

  /* Keyboard: tab through every focusable element, checking focus is visible. */
  const focusables = await page.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').count();
  let focusVisible = 0;
  let focusMissing = 0;
  for (let i = 0; i < focusables; i++) {
    await page.keyboard.press("Tab");
    const style = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const wrapper = el.closest(".search, .select-wrap");
      const ws = wrapper ? getComputedStyle(wrapper) : null;
      return {
        outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
        shadow: s.boxShadow !== "none" || (ws !== null && ws.boxShadow !== "none")
      };
    });
    if (style === null) continue;
    if (style.outline || style.shadow) focusVisible += 1;
    else focusMissing += 1;
  }

  const skipNav = await page.locator('.skip-nav, [href="#main"], #main-content').count();
  const headings = await page.$$eval("h1,h2,h3,h4", (hs) => hs.map((h) => h.tagName.toLowerCase()));
  const landmarks = await page.$$eval("header, nav, main, footer, aside, [role=region], section[aria-label]", (els) => els.length);

  /* Touch targets: primary controls only, at phone width. */
  const smallTargets = await page.evaluate(() => {
    const selector = 'button, select, input, a.btn, [role="button"], .segmented button, .nav-chip';
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), label: (el.textContent || el.id || "").trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((t) => t.w < 44 || t.h < 44);
  });

  report.push({
    page: cfg.name,
    violations: axe,
    focusables,
    focusVisible,
    focusMissing,
    skipNav,
    h1: headings.filter((h) => h === "h1").length,
    headings: headings.length,
    landmarks,
    smallTargets
  });
  await page.close();
}
await browser.close();

console.log(`Phase 3 accessibility — ${BASE}`);
let failures = 0;
for (const r of report) {
  const bad = r.violations.length;
  failures += bad;
  console.log(
    `${r.page.padEnd(12)} axe=${bad === 0 ? "clean" : bad + " violations"} focus=${r.focusVisible}/${r.focusVisible + r.focusMissing} skipNav=${r.skipNav} h1=${r.h1} landmarks=${r.landmarks} smallTargets=${r.smallTargets.length}`
  );
  for (const v of r.violations) {
    console.log(`  AXE ${v.impact} ${v.id}: ${v.help}`);
    for (const node of v.nodes) console.log(`    at ${node}`);
  }
  for (const t of r.smallTargets.slice(0, 6)) console.log(`  TARGET ${t.w}x${t.h} <${t.tag}> ${t.label}`);
}

const noSkip = report.filter((r) => !r.skipNav).map((r) => r.page);
const noH1 = report.filter((r) => r.h1 === 0).map((r) => r.page);
const focusGaps = report.filter((r) => r.focusMissing > 0).map((r) => r.page);
console.log(`\nPages missing skip-nav: ${noSkip.join(", ") || "none"}`);
console.log(`Pages missing h1: ${noH1.join(", ") || "none"}`);
console.log(`Pages with invisible focus: ${focusGaps.join(", ") || "none"}`);
console.log(`axe violations: ${failures}`);

process.exit(failures || noSkip.length || noH1.length || focusGaps.length ? 1 : 0);
