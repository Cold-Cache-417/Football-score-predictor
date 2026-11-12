import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const pages = ['index', 'fixtures', 'history', 'match', 'models', 'performance', 'creator', 'about'];
const BASE = 'http://127.0.0.1:4173';

const browser = await chromium.launch();

console.log('===============================================================');
console.log('  MULTI-SKILL DESIGN AUDIT REPORT (Calibra La Liga Platform)');
console.log('  Skills evaluated: design-review, apple-design, apple-design-web, ui-ux-pro-max');
console.log('===============================================================\n');

const auditResults = [];

for (const p of pages) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/${p}.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const metrics = await page.evaluate(() => {
    // 1. Check tap targets (< 44px)
    const smallTargets = [];
    const interactive = Array.from(document.querySelectorAll('a, button, input, select, [role="button"]'));
    interactive.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (rect.width < 44 || rect.height < 44) {
          smallTargets.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.getAttribute('aria-label') || el.id || 'el').slice(0, 25).trim(),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
          });
        }
      }
    });

    // 2. Check font size contrast and hierarchy
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
      tag: h.tagName.toLowerCase(),
      size: window.getComputedStyle(h).fontSize,
      weight: window.getComputedStyle(h).fontWeight,
      text: h.innerText.slice(0, 30)
    }));

    // 3. Contrast / Color scheme
    const bodyStyle = window.getComputedStyle(document.body);
    const bg = bodyStyle.backgroundColor;
    const color = bodyStyle.color;

    // 4. Focus states
    const buttonsWithFocus = interactive.filter(el => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    }).length;

    return {
      smallTargetsCount: smallTargets.length,
      smallTargetsSample: smallTargets.slice(0, 5),
      headings,
      bg,
      color,
      buttonsTotal: interactive.length,
      buttonsWithFocus
    };
  });

  // Mobile check (375px)
  const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobilePage.goto(`${BASE}/${p}.html`, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(400);

  const mobileMetrics = await mobilePage.evaluate(() => {
    const el = document.body;
    return {
      xOverflow: el.scrollWidth - el.clientWidth,
      dockVisible: Boolean(document.querySelector('.mobile-dock, nav.mobile-nav'))
    };
  });

  await page.close();
  await mobilePage.close();

  auditResults.push({ page: p, desktop: metrics, mobile: mobileMetrics });
}

await browser.close();

// Output synthesized design audit
auditResults.forEach(r => {
  console.log(`--- Page: ${r.page}.html ---`);
  console.log(`  Interactive elements: ${r.desktop.buttonsTotal}`);
  console.log(`  Tap targets < 44px: ${r.desktop.smallTargetsCount}`);
  if (r.desktop.smallTargetsCount > 0) {
    console.log(`    Sample:`, r.desktop.smallTargetsSample.map(s => `${s.tag}[${s.text}]: ${s.w}x${s.h}px`).join(', '));
  }
  console.log(`  Headings count: ${r.desktop.headings.length}`);
  console.log(`  Mobile X-Overflow (375px): ${r.mobile.xOverflow}px`);
  console.log('');
});

