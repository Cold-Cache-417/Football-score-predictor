# NEXT_TASK — Home hero checkpoint: COMPLETE, awaiting approval

Status on 2026-11-07: **implementation and verification finished. STOPPED
here as instructed.** No other page, no API, no model change.

Approval is required before anything in §4 starts.

---

## 1. Delivered

- Build unblocked: `tsc --noEmit` exit 0, `npm run build` exit 0.
- Fixture selection now uses real kickoff times in Europe/Madrid and never
  presents a started match as upcoming; explicit snapshot-stale empty state.
- Hero redesigned around: match headline (crests + club names) → most likely
  exact scoreline with its probability → blend H/D/A → honest method footer.
- Dark-only palette; light-theme leftovers removed.
- Atmosphere: layered radial washes + one masked hairline grid + a
  cursor-following light driven by a single rAF loop writing CSS variables.
- Split probability bar encodes the real 45.3 / 28.8 / 25.9 split and grows
  once on load; hovering an outcome dims the others.
- 35 real club crests in `web/public/crests/` with
  `web/src/lib/crest-registry.json` recording Wikipedia page, file page and
  licence for every club; initials fallback retained for anything missing.
- "LIVE" labelling removed everywhere; nav shows composition and season.
- Framer Motion removed from the hero (CSS-only motion) — one less runtime
  failure mode, and it was the cause of the zero-width bar.

## 2. Evidence produced

| Requirement | Evidence |
|---|---|
| TypeScript passes | exit 0 |
| Production build passes | exit 0, `/` = Partial Prerender |
| Desktop 1440×900 | `design-check/hero-desktop.png` |
| Mobile 390×844 | `design-check/hero-mobile.png` |
| Reduced motion | `design-check/hero-reduced-motion.png` |
| Real fixture | Espanyol vs Deportivo La Coruña, 2026-11-07 15:15 CET |
| Real predictions | 1–1 @ 12.8%, 45.3 / 28.8 / 25.9, DC 43.2/27.0/29.8, CB 49.1/32.0/18.8 |
| Crests loading | both `<img>` report `complete` with `naturalWidth` 83; 0 failed requests |
| Cursor light | `--glow-x: 57.76%` written after real mouse movement |
| Reduced motion | cursor light not attached; bar at final width; no console errors |
| No overflow | `scrollWidth − clientWidth = 0`; document height exactly 900 / 844 |

## 3. Decisions taken (flag if you disagree)

1. **Most likely scoreline is the largest element.** The brief says this is a
   match predictor, so the scoreline outranks the H/D/A numerals.
2. **One grid, not two.** `RippleGrid` is no longer mounted; the CSS grid plus
   cursor light carries the atmosphere. The component file is still present.
3. **CSS motion instead of Framer Motion** in the hero. Fewer moving parts and
   it fixed a real rendering bug.
4. **No count-up numbers.** They previously rendered `0.00` in the HTML before
   hydration. Real values are now in the markup from the first byte.
5. **Dixon-Coles vs CatBoost shown per outcome.** Small `DC … · CB …` lines
   under each percentage — real data explaining the 65/35 blend, not decoration.

## 4. Out of scope until approval

Fixtures page, match detail page, models page, FastAPI, calibration chart,
per-season comparison, GSAP/Lenis scroll scenes, accessibility audit,
Lighthouse, deployment.

## 5. Recommended next steps after approval

1. **Fixtures page** — all nine upcoming fixtures as a list, same data layer,
   reusing `getHeroState`-style access but returning every unplayed match.
2. **Re-run `python -m src.export_website`** (needs explicit approval — it
   refits Dixon-Coles and CatBoost) to restore the missing artefacts and
   refresh the snapshot, ideally before the current one expires on 8 Nov.
3. **Models page** — locked-test RPS table, paired tests, calibration chart
   from `reports/calibration_bins.csv`, bookmaker comparison, and the plainly
   stated "does not beat the market" conclusion.
4. **Match detail page** — needs the full Dixon-Coles grid (missing artefact),
   so it depends on step 2.
5. Two small cleanups when convenient: decide on `RippleGrid.tsx`
   (delete or re-adopt), and prune the now-unused `framer-motion`/`gsap`/
   `lenis`/`lucide-react` dependencies.
