import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const VIEWPORTS = [
  { name: '1440', w: 1440, h: 900 },
  { name: '1024', w: 1024, h: 768 },
  { name: '768', w: 768, h: 800 },
  { name: '390', w: 390, h: 844 },
  { name: '375', w: 375, h: 812 },
];
const PAGES = ['index', 'fixtures', 'history', 'match', 'models', 'performance', 'creator', 'about', '404'];
const BASE = 'http://127.0.0.1:4173';
const OUT = 'screenshots/audit';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  for (const p of PAGES) {
    const url = p === '404' ? `${BASE}/nonexistent-page` : `${BASE}/${p}.html`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => {
        const el = document.body;
        return { scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight };
      });
      const xOverflow = overflow.scrollW - overflow.clientW;
      const yOverflow = overflow.scrollH - overflow.clientY;
      const name = `${vp.name}-${p}`;
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      results.push({ name, viewport: vp.name, page: p, xOverflow, yOverflow, ok: xOverflow <= 0 });
    } catch (e) {
      results.push({ name: `${vp.name}-${p}`, viewport: vp.name, page: p, error: e.message, ok: false });
    }
  }
}
await browser.close();

console.log('--- Visual audit results ---');
const failed = results.filter(r => !r.ok);
console.log(`Total: ${results.length}, passed: ${results.length - failed.length}, failed: ${failed.length}`);
failed.forEach(r => console.log(`  FAIL: ${r.page} @ ${r.viewport}px — ${r.error || `xOverflow=${r.xOverflow}px`}`));
console.log('\nOverflow matrix (x px):');
const matrix = {};
results.forEach(r => { if (!matrix[r.viewport]) matrix[r.viewport] = {}; matrix[r.viewport][r.page] = r.xOverflow ?? 'ERR'; });
console.log(JSON.stringify(matrix, null, 2));
