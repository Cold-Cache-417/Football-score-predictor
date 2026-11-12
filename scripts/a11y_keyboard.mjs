import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
const PAGES = ['index','fixtures','history','match','models','performance','creator','about'];
const BASE = 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const report = [];

for (const p of PAGES) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/${p}.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 1. Tab through all focusable elements
  const focusables = await page.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').count();
  let tabbed = 0;
  let lastHref = '';
  for (let i = 0; i < focusables + 5; i++) {
    await page.keyboard.press('Tab');
    tabbed++;
    if (tabbed > focusables + 4) break;
  }

  // 2. Check for focus outline visibility
  const hasOutline = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    return sheets.some(s => {
      try { return Array.from(s.cssRules).some(r => r.cssText && r.cssText.includes(':focus')); }
      catch { return false; }
    });
  });

  // 3. Skip-nav presence
  const skipNav = await page.locator('.skip-nav, [href="#main"], #main-content').count();

  // 4. Landmark roles
  const landmarks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('header, nav, main, footer, section[aria-label], aside')).map(el => el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? ':' + el.getAttribute('aria-label') : ''));
  });

  // 5. Heading hierarchy
  const headings = await page.evaluate(() => {
    const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4'));
    return hs.map(h => h.tagName.toLowerCase());
  });

  report.push({ page: p, focusables, tabbed, hasOutline, skipNav, landmarks, headings });
  await page.close();
}

console.log('--- A11Y / keyboard audit ---');
for (const r of report) {
  const h1 = r.headings.filter(h => h === 'h1').length;
  console.log(`${r.page}: focusables=${r.focusables} tabbed=${r.tabbed} outline=${r.hasOutline} skipNav=${r.skipNav} h1=${h1} headings=${r.headings.length} landmarks=${r.landmarks.length}`);
}
const noSkip = report.filter(r => !r.skipNav);
const noH1 = report.filter(r => r.headings.filter(h => h === 'h1').length === 0);
console.log(`\nPages missing skip-nav: ${noSkip.map(r => r.page).join(', ') || 'none'}`);
console.log(`Pages missing h1: ${noH1.map(r => r.page).join(', ') || 'none'}`);
await browser.close();
