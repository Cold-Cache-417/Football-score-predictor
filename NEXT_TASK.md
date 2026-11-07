# NEXT_TASK — Home hero + design foundation (scope for the next work block)

Status: **NOT STARTED. Awaiting the user's go-ahead.**
Nothing in `web/src` has been modified yet by the incoming agent.

Approved scope is exactly the Home hero. Everything in §7 is out of scope.

---

## 0. Non-negotiables

- Do not modify `src/`, `data/`, or `reports/`. No refits, no re-exports.
- Do not invent numbers. Every value rendered must be read from
  `data/website/upcoming_predictions.csv` (and later the backtest CSVs).
- Do not add dependencies. `framer-motion`, `gsap`, `lenis`, `lucide-react`
  are already installed and unused; generate crest assets locally instead of
  pulling packages.
- Keep Newsreader + Archivo.
- Dark only. No light theme, no white or bone sections.
- No purple/cyan gradients, no gradient text, no glassmorphism, no
  card-in-card, no generic three-card rows, no decorative fade-ins.

## 1. Unblock the build (must be first)

Two type errors stop `npm run build`:

1. `src/app/page.tsx` imports `{ Hero }` — either change to the default import
   or add a named export. Pick one and keep the file's convention consistent.
2. `src/components/ui/progress.tsx` declares an `indicatorClassName` prop it
   never uses — add it to the props type and apply it, or delete it.

Verification: `npx tsc --noEmit` exits 0 and `npm run build` exits 0.

## 2. Fix fixture selection honestly

In `src/lib/fixtures.ts`:

- Filter to `date >= today` (compare on calendar date, not raw epoch, using a
  fixed server-side "today" so server and client agree).
- Keep the `live_forward` and positive-probability filters.
- When no fixture qualifies, return a distinguishable empty state rather than
  `null` ambiguity, so the hero can say: this is a snapshot taken on
  2026-11-07 and it contains no remaining unplayed fixtures; re-run
  `src.export_website` for fresh ones.
- Never fall back to a past fixture.
- Return the snapshot as-of date alongside the fixture so the UI can label it.

Unit-check by asserting the chosen fixture's date is not before today, and
that `2026-11-06` rows are rejected even when present.

## 3. Redesign the hero around the prediction

Required content, in priority order:

1. **The match**: `Malaga` vs `Racing Santander` as a real headline, both
   crests large and adjacent, the fixture date and a "prediction snapshot"
   label (not "LIVE", not "LIVE FORWARD").
2. **The scoreline prediction**: `1–1` at genuinely display scale, with
   `10.2%` beside it, labelled as the most likely exact score from
   Dixon-Coles. This is a match predictor — the scoreline is the hero, not a
   footnote.
3. **H/D/A from the blend**: `47.7% / 25.6% / 26.8%` as three readable
   figures with outcome labels, visually subordinate to the scoreline but
   prominent. Use commas or spaces for the triple, not a bare
   `0.48 / 0.26 / 0.27` stripped of context.
4. **One line of method**: blend is 65% Dixon-Coles + 35% CatBoost; the
   scoreline grid is Dixon-Coles only, so the two can legitimately disagree.
5. Remove the duplicated percentages (giant `0.48` plus `47.7%` showing the
   same number twice).

Copy must be plain and honest; no marketing filler. State that the model does
not beat the bookmaker (full RPS table belongs on the Models page, but the
hero's method line should not imply an edge).

## 4. Visual direction

Keep the existing foundation (deep pine-black, volt accent, Newsreader +
Archivo, hairline grid) and raise the execution:

- One atmosphere, not two competing grids: choose either the WebGL ripple or
  the CSS hairline grid as the visible texture, and use the other only if it
  adds real depth at very low opacity.
- Cursor-reactive light: a soft radial light that tracks the pointer with
  smoothing, driven by a CSS custom property updated inside a single
  `requestAnimationFrame` loop — **not** React state on every `mousemove`,
  which currently re-renders the whole hero per event.
- Desktop only for pointer effects; disable entirely on touch and under
  `prefers-reduced-motion`.
- Meaningful motion only: one orchestrated load sequence (crests settle, then
  scoreline, then the three probabilities resolving to their real values).
  Motion should communicate model composition, e.g. the blend bar showing the
  65/35 split.
- Number legibility: current `#8CA296` on `#060C09` is fine for body labels;
  volt `#D9FF3F` must never be used as small text on a light surface (the
  broken screenshots show exactly that failure). Verify volt-on-dark contrast
  for the smallest volt text used.
- Typography: numerals in Newsreader with `tabular-nums`; labels in Archivo.
  Avoid tracked-out all-caps eyebrows on every block — at most one micro-label.

## 5. Crests

Real crests are absent (`web/public/` has only Next.js defaults and
`TeamCrest.tsx` renders initials only). Plan:

- Fetch real club crests into `web/public/crests/` (Wikimedia Commons,
  public-domain / CC sources), one file per club, with a small registry file
  recording source URL and licence per crest.
- Match on the canonical team names actually present in the CSVs, including
  clubs no longer in La Liga (the dataset spans 2010/11–2026/27, so
  relegated clubs appear in fixtures and backtest rows).
- `TeamCrest` uses `next/image` when a crest exists and falls back to the
  club-colour + initials badge otherwise. Fix low-contrast colours
  (`Real Madrid` yellow with white initials) and duplicated blues.
- Never generate or hand-draw a fake crest.
- If a crest cannot be sourced with a clear licence, leave that club on the
  fallback and record it as such. Do not silently ship a wrong badge.

## 6. Verification required before reporting done

| Check | Evidence to produce |
|---|---|
| Type check | `npx tsc --noEmit` exit 0 |
| Build | `npm run build` exit 0 |
| Desktop screenshot | 1440 × 900, saved PNG, actually inspected |
| Mobile screenshot | 390 × 844, saved PNG, actually inspected |
| Fixture correctness | chosen fixture date ≥ today, printed from the CSV |
| Real numbers | H/D/A and scoreline cross-checked against the CSV row |
| Crests | network/console shows images loading; visually confirmed in screenshot |
| Cursor light | demonstrable via browser evaluation of the CSS variable after pointer move |
| Reduced motion | emulated, confirms no looping animation and static values |
| Mobile overflow | `scrollWidth <= clientWidth` at 390px |

Do not report a visual feature as working because the code exists. Look at the
screenshot.

## 7. Explicitly out of scope until the hero is approved

Fixtures page, match detail page, models page, FastAPI, calibration chart,
per-season charts, GSAP/Lenis scroll scenes, full a11y audit, Lighthouse,
deployment. Do not start any of them.

## 8. Open questions for the user

1. There is no Git repository. May I `git init` and make one baseline commit
   before touching code, so this work is recoverable?
2. Crest assets need to be downloaded from Wikimedia (network access, ~20–30
   files, mixed licences to record). Approve?
3. `data/website/models/` is empty and two upcoming scoreline artefacts are
   missing, though `DATA_CONTRACT.md` documents them. Re-running
   `src.export_website` would restore them, but it refits the models — it
   needs your explicit approval and is not part of the hero task.
