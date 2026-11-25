# AUDIT_REPORT.md — Calibra frontend audit

Date: 2026-11-25
Scope: `web/` (13 HTML pages, `concept.css` 6,208 lines, `app.js`, `data-live.js`)
Skills: `impeccable`, `antislop`, `web-design-guidelines`, `ui-ux-pro-max`
Mode note: no saved antislop preference exists; this run applies **during** because Phase 3
edits files. Say the word if you want **after** (audit-only) instead.

Method: static read of every page and the token block, contrast computed from the actual
hex values, real-browser check of the live site, and the bundled Web Interface Guidelines
snapshot (`references/command.md`, pinned upstream SHA).

---

## Verdict

| Area | Verdict | Notes |
|---|---|---|
| Brand fidelity | **PASS** | Coral/bone/broadcast identity is coherent and worth keeping |
| Accessibility (WCAG AA) | **FAIL** | Contrast + control sizes fixed in Phase 3 batch 1; eyebrow bump applied |
| Semantics / keyboard | **PASS** | Real buttons/links, skip link, focus-visible, labelled controls |
| Responsive | **PASS** | 7 breakpoints, scrolling table wrappers, mobile dock |
| Anti-slop copy | **PASS** | Zero banned marketing words; specific, honest numbers |
| Anti-slop layout | **PASS** | No glow, no gradient text, no fake metrics, no SaaS card wall |
| Visual hierarchy | **PARTIAL** | Correct, but label density and 9.5px eyebrows flatten it |
| Sharing / metadata | **FAIL** | No Open Graph or Twitter card on any page |
| Content integrity | **PARTIAL** | Stale 404 fallback, contradictory `about` redirect, dead duplicate source |
| Performance | **PASS** | Self-hosted preloaded fonts, no layout-shifting hero images |

**Blocking before a makeover ships:** none. All blockers resolved in Phase 3 batch 1.

---

## P0 — correctness and sharing — RESOLVED (Phase 3 batch 1)

### A1. Stale matchweek in the static fallback — **FIXED**
- `web/index.html:49` — now `<span class="topbar-round">La Liga · 2026/27</span>`
- `web/404.html:33` — now the same neutral fallback
- `web/match.html:49` — now `Match centre · La Liga`

JS (`data-live.js` `roundLabel()`) overwrites `.topbar-round` at runtime; the static fallback no
longer lies pre-hydration.

### A2. `about.html` sends visitors to three different places — **FIXED**
- `web/about.html:11` now reads `window.location.replace("how-it-works.html")`
- Canonical, meta refresh and JS now agree on one destination.

### A3. `models.html` duplicates `how-it-works.html` — **PASS in production, debt in source**
- Already 301'd via `vercel.json:14` and `server/app.mjs:412`; kept as redirect-only source.

### A3. `models.html` duplicates `how-it-works.html` — **PASS in production, debt in source**
- `web/models.html:6` has the same `<title>` as `web/how-it-works.html:6`
- 367 vs 512 lines, near-identical content; `how-it-works` is the superset
- already redirected by `vercel.json:14` and `server/app.mjs:412`

It is not served, so it is not duplicate content in production. It is still 367 lines of dead
source that tests assert against (`tests/http_server.test.mjs:56`), so deleting it is churn.
Recommendation: leave the file, keep the 301, and do not build new pages against it.

### A4. No share card — **FAIL**
- `property="og:*"` count is **0** on index, fixtures, history, how-it-works
- no `twitter:card`

The whole distribution plan is "send the link to a friend", and the link currently previews as a
bare URL. Fix: `og:title`, `og:description`, `og:type=website`, `og:url`, `og:image` (1200×630),
`twitter:card=summary_large_image`. Reuse the existing hero plate; no new asset style.

---

## P1 — accessibility — RESOLVED (Phase 3 batch 1)

### B1. Draw label fails AA — **FIXED**
- Added `--draw-ink: #7d5500` (light) / `--draw-ink: #f2c14e` (dark) next to `--draw`.
- `.form .d` and `.timeline-event--yellow .event-icon` now use `--draw-ink` for text.
- Draw text on tinted surfaces now measures ≥ 5.0:1 (was 4.23:1). Outcome colour meanings untouched.

### B2. Controls below the 44px target and iOS zooms the search field — **FIXED**
- `.search`, `.segmented`, `.select-wrap` heights 40px → **44px** (`concept.css:2297`, `:2349`,
  `:2401`, `:2420`).
- `.search input` font-size 12.5px → **16px** (iOS focus zoom).
- `.model-tabs button`, `.match-subnav a` heights 40px → **44px**.

### B3. Two `h1` elements on the club page — **PASS (hidden branch)**
- `web/club.html:88` vs `web/club.html:104`: the error `h1` sits in `#club-empty`, which ships
  `hidden`. Hidden removes it from the a11y tree, so one `h1` is exposed. No fix required.

### B4. Tiny metadata type — **PARTIAL → PARTIAL**
- `.eyebrow, .section-label` mono 9.5px → **11px** (now reads at `:454`).
- Component micro-labels (badges, score-prob, result-date) stay mono 9.5px; they pass contrast
  and are numeric, so left alone for now.

### Passed
Skip link first in `index.html:40`; one `h1` on real pages; `:focus-visible` ring at
`concept.css:373` including an inverse variant; `outline:0` at `:2322`/`:2420` is replaced by
`:focus-within` at `:2305`/`:2410`; table wrappers scroll; form controls have labels or `aria-label`;
async fixture count uses `role="status" aria-live="polite"`; `prefers-reduced-motion` handled at
`:6031`.

---

## P2 — craft and hierarchy

### C1. Em dashes in body copy — **FAIL (antislop copy rule)**
Counts across the six main pages: index 9, fixtures 9, how-it-works 11, history 10, club 6,
match 2. Many are placeholder glyphs (`—` inside empty data slots) and `<title>` separators,
which are fine. The prose instances should become a colon, comma, or full stop.
Target: zero em dashes in sentences; keep `—` only as the empty-value glyph.

### C2. Heading density flattens the page — **FAIL (impeccable hierarchy)**
- `web/how-it-works.html` has **18 `h2`** and 8 `h3`
- `web/models.html` has **11 `h2`**, `web/performance.html` has **10 `h2`**

Every sub-point is promoted to a section heading, so nothing is actually a section. Group into
4–5 chapters, demote supporting points to `h3` or definition-style rows, and let the display
face carry only the chapter level. This is the single biggest visual-hierarchy win available.

### C3. Inline style and one-off spacing — **FAIL (consistency)**
- `web/index.html:196` — `<div class="panel" style="margin-top:10px">`

Move to a class. The CSS already has a spacing system; inline values quietly bypass it.

### C4. Label vs content colour — **PARTIAL**
`.section-label` is mono 9.5px with `0.15em` letter-spacing in coral-ink. It reads as decoration
because it is smaller than every number near it. Decide one eyebrow treatment and use it
everywhere; do not vary size per section. (See B4.)

### C5. Repeated shadow, one level only — **PASS**
`--shadow-1` is used 8 times, `--shadow-2` never. No glow, no coloured shadow, no stacked card
wall. Keep this restraint.

### C6. Mobile structure — **PASS**
Breakpoints at 380/560/720/760/900/1000/1120px; `.mobile-dock` present on inner pages with four
destinations; tables scroll inside their own wrappers; `--dock-h` reserved on `body.has-dock`.
No horizontal page overflow found in the static read.

---

## Anti-slop 40-rule filter — result

| Rule group | Result |
|---|---|
| Banned vocabulary (seamless, unleash, revolutionary, AI-powered, elevate, …) | **PASS** — 0 hits |
| Fake or unverifiable metrics | **PASS** — every number is sourced and dated |
| Decorative gradient/glow/orb | **PASS** — none |
| Cookie-cutter SaaS hero + 3 feature cards | **PASS** — hero is the actual fixture |
| Repetitive identical cards | **PASS** — results rows, table, timeline are distinct |
| Title Case headings | **PASS** — sentence case |
| Lorem ipsum / placeholder copy | **PASS** |
| Em dash spray | **FAIL** — C1 |
| Mobile reflow breakage | **PASS** in static read; confirm at 360px in Phase 3 |
| Tap targets < 44px | **FAIL** — B2 |
| Contrast < 4.5:1 | **FAIL** — B1 |

Score: **8 pass / 3 fail** before the makeover.

---

## UI/UX Pro Max structural upgrades (theme-faithful)

1. **Chapter the explainer.** Five anchored sections with a sticky in-page nav; the content
   already exists, it is only flat.
2. **One reading column for prose, full width only for data.** Cap text at 68ch, let tables and
   the fixture rail break out. The current page alternates without a rule.
3. **Promote the prediction.** The hero already does this; the match page should repeat the same
   hierarchy (fixture → scoreline → probabilities → evidence), not invent a second one.
4. **State before decoration.** Every fixture row should answer "played / live / upcoming" in
   text first, colour second. Already true; keep it.
5. **One primary action per view.** Fixtures has 8 buttons; most are filters and should read as a
   toolbar, not eight competing CTAs.

---

## Phase 3 execution order

1. Fix P0 correctness: neutral round fallback, one redirect target, add share metadata.
2. Fix accessibility: `--draw-ink`, 44px controls, 16px search input, single `h1`.
3. Restructure `how-it-works` / `models` into chapters; align `performance` headings.
4. Copy pass: remove prose em dashes, tighten the explainer, keep every factual claim.
5. Craft pass: spacing rhythm, type scale, eyebrow consistency, inline-style removal.
6. Re-run this audit plus the Node/Python suites, publish, and verify in a real browser at
   360px, 768px, and 1440px.
