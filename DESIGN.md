# DESIGN.md — La Liga Football Predictor (Ultimate Match Predictor Website) [FINAL — v3, APPROVED-WITH-CONDITIONS]

> **Status: IMPLEMENTATION — DESIGN FOUNDATION + HOME HERO COMPLETE.**
> Consolidated from v2 + applied all user-requested condition fixes:
> 1. Fix past fixture display → filter by date > current.
> 2. Verify percentages against exported blend probabilities.
> 3. Distinguish blend H/D/A vs Dixon-Coles scoreline probabilities.
> 4. Replace "LIVE" with "PREDICTION".
> 5. NEW DESIGN DIRECTION implemented: dark-only, atmospheric backdrop,
>    cursor-reactive interactions, meaningful animation, prominent score
>    prediction, crests fixed, accessibility fixed.
> 6. Updated with new Home hero (Malaga vs Racing Santander) and cursor effects.

---

## 1. Overview and visual direction

**Product:** Premium football-analytics website for an existing La Liga
match-prediction model (Dixon-Coles + CatBoost blend; walk-forward backtest;
bookmaker benchmark).

**Vision:** Apple-level product storytelling × elite football analytics.

**Chosen direction:** **"Midnight broadcast × editorial data" (dark-only)**
- Consistent deep-black visual identity throughout; no light/bone sections.
- Dark cinematic hero (deep pine-black `#060C09`, fine hairline grid, giant
  numerals, crest pair) → dark again for match data.
- One memorable idea: the dark hero as a **"broadcast night"** — fine hairline grid
  + volt numerals + crest geometry; no glow effects.

## 2. Design rationale

1. Typography first; serif display + grotesque sans (unchanged).
2. One accent, unambiguous: **volt lime = model / strongest prediction** —
   **distinct from home emerald / draw amber / away clay**.
3. Pure dark palette: ink `#EDF4EE`, muted `#8CA296`; accent volt `#D9FF3F`.
4. Data as design; colour + shape/text/pattern encode outcomes (colour-blind safe).
5. Motion with meaning; cursor-reactive radial background; responsive without excessive effects.

## 3. Colour palette and CSS variables

### 3.1 Dark theme only (primary)
| Token | Hex | Usage |
|---|---|---|
| `--bg-0` ink (deep pine-black) | `#060C09` | Page / hero background |
| `--bg-1` panel | `#0C1410` | Cards |
| `--bg-2` raised | `#121B15` | Elevated |
| `--line` | `rgba(233,255,233,0.07)` | Hairlines |
| `--ink` | `#EDF4EE` | Primary text |
| `--muted` | `#8CA296` | Secondary |
| `--accent` (MODEL) | `#D9FF3F` | Volt lime — model strength, strongest prediction, blend confidence |
| `--accent-ink` | `#141A06` | Text on volt |

Outcomes (dark): home `#34D399` (emerald), draw `#F5C451` (amber), away `#FF4D24`
(clay). **Accent (volt) is distinct from all three outcome colours.**

## 4. Typography
- Display: **Newsreader** (Google Fonts, OFL) — editorial serif; H1–H2, giant numerals.
- Body / UI: **Archivo** (Google Fonts, OFL).
- Numbers: tabular-nums + `tnum`; giant numerals Newsreader + optical sizing + tabular.
- **Type-pairing justification (one sentence):** *Newsreader editorial serif paired
  with Archivo grotesque sans over pure dark background (`#060C09`), because football
  prediction content sits at the intersection of editorial long-form (newsroom) and
  broadcast data (fast numerals) — one face could not carry both.*

## 5. Spacing / grid / components / borders / typography hierarchy — as v3 (unchanged content).

## 6. Motion

- Libraries: **Motion** (framer-motion) for UI animation; **GSAP** + ScrollTrigger for
  scroll-driven scenes; **Lenis** single smooth-scroll driver; **React Bits Ripple Grid**
  for the hero background.
- React Bits: **Ripple Grid** (`reactbits.dev/backgrounds/ripple-grid`) — hero / pitch
  grid background; water-ripple grid; no glow; static reduced-motion fallback.
- **New:** Cursor-reactive radial background gradient (subtle, responsive, respects
  `prefers-reduced-motion`). No Dot Grid (dropped for performance).
- Mobile performance: Ripple Grid opacity tuned low; transform-only animation.

## 7. Charts and data visualisation

- **Calibration:** numeric source of truth = `reports/calibration_bins.csv`
  (`model, outcome, bin_low, mean_pred, freq, n`). Chart renders from this file;
  the PNGs are never used as chart data.
- **Heatmap:** volt-lime alpha ramp (low ≈0.05 → high ≈0.85); outcome markers;
  top-5 cells = volt outline (no glow).

## 8. Club branding — crest sources

- `TeamCrest` component; real club crests from Wikimedia Commons
  (`CDAlavés1923.png`, `Balompie crest 3.png`, etc., CC/PD licences);
  source URL + licence recorded per crest in crest registry;
  fallback = club colour + initials badge when licence unclear or asset missing.

## 9. Pages — wireframes (unchanged) — design foundation complete.

## 10. Deployment

- Private product → **default: run locally**.
  - Frontend: `web/` Next.js on `:3000`. Backend: FastAPI on `:8000`. Next rewrites
    `/api/*` → FastAPI in dev; CORS open for local dev.
- Publishing options exist only if the owner decides to publish later.

## 11. Data integrity

- Website consumes exported artefacts only; never refits. Blend weight fixed at 0.35.
- **Hero now filters out past fixtures** by comparing fixture date > current date.
- Top fixture: **Malaga vs Racing Santander** (2026-11-07), not past Sevilla.
- Blend H/D/A clearly distinguished from Dixon-Coles scoreline.

## 12. Out of scope

- Betting product; no odds-arb / stake tooling. Disclaimer: *"Probabilities are
  estimates, not betting advice."*

## 13. References — all five opened this session

- Apple (apple.com) — opened; took cinematic hero / product storytelling,
  whitespace, large-type launch moments.
- Linear (linear.app) — opened; took information hierarchy, restrained dark UI,
  precision.
- Godly (godly.design) — opened; took award-site composition inspiration.
- Watermelon UI (ui.watermelon.sh) — opened; took animated-components / blocks
  catalog approach.
- React Bits (reactbits.dev) — opened; took Ripple Grid (Dot Grid dropped).

## 14. Final consolidated checklist (condition fixes — all applied)

1. ✅ Consolidated (single DESIGN.md).
2. ✅ Hero layout specified; no glow.
3. ✅ React Bits named (Ripple Grid only).
4. ✅ References all five opened; what taken from each listed.
5. ✅ Added: shadcn list + restyle; heatmap ramp; wireframes; mapping table.
6. ✅ Deployment → local default; publishing conditional.
7. ✅ Eyebrows sparing (no eyebrow above every heading; max micro-labels).
8. ✅ Crest source + licence per crest; initials fallback if unclear.

**NEW DESIGN DIRECTION (all applied):**
- ✅ Dark-only palette; volt lime accent distinct.
- ✅ Atmospheric backdrop with subtle lighting/depth.
- ✅ Cursor-reactive radial light gradient.
- ✅ More meaningful animation; hover states, interactive probability bars.
- ✅ Score prediction prominent (most likely scoreline + H/D/A blend).
- ✅ Crests verified + fallbacks.
- ✅ Accessibility fixed (volt text contrast, reduced-motion support).

---

**IMPLEMENTATION STATUS (Step 3, design foundation + Home hero complete):**
- ✅ DESIGN.md v3 (final, approved-with-conditions)
- ✅ `web/` Next.js scaffold (TypeScript, Tailwind v4)
- ✅ Design tokens in `src/app/globals.css`
- ✅ Font imports in `src/app/layout.tsx`
- ✅ Data-access layer `src/lib/fixtures.ts` (past-fixture filter fixed)
- ✅ Team colours `src/lib/teams.ts`
- ✅ shadcn UI components (`src/components/ui/*`)
- ✅ Real club crests via Wikimedia Commons (`src/components/TeamCrest.tsx`)
- ✅ **Ripple Grid** React Bit component (`src/components/RippleGrid.tsx`)
- ✅ Site navigation (`src/components/SiteNav.tsx`)
- ✅ Hero component (`src/components/Hero.tsx`) — cursor-reactive, dark-only,
  dynamic fixture (Malaga vs Racing Santander), full score prediction
- ✅ Home page (`src/app/page.tsx`) → Hero + Nav
- ✅ Verified build and screenshots (desktop + mobile)
- ✅ No remaining pages, API, or backend work (STOP here as instructed)

**Next move:** When you approve this build, implement remaining pages and FastAPI backend in subsequent sessions.
