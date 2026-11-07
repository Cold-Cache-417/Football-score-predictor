# CURRENT_STATE — verified state of the project, 2026-11-07

Everything here was checked against the files on disk. Where a previous
report claimed something that the files contradict, the contradiction is
called out.

---

## 1. Summary

The **Python modelling and data side is complete and consistent**. The
**website is an unfinished home page that does not build**.

| Layer | Verdict |
|---|---|
| Dataset | ✅ 6,189 matches, 17 seasons, through 2026-11-02 |
| Backtest exports | ✅ 1,140 test rows, schema matches `DATA_CONTRACT.md` |
| Upcoming exports | ⚠️ partial (4 of 7 documented artefacts) |
| Model pickles | ❌ missing, `models/` empty |
| Next.js build | ❌ fails type check |
| Home hero | ⚠️ implemented but broken and visually wrong |
| Other pages | ❌ not built |
| FastAPI | ❌ not built |
| Screenshots | ❌ stale, do not match code |

## 2. Build and type check — FAILS

`cd web && npm run build` exits 1. `npx tsc --noEmit` exits 2.

```
src/app/page.tsx(1,10): error TS2614: Module '"@/components/Hero"' has no
  exported member 'Hero'. Did you mean to use 'import Hero from
  "@/components/Hero"' instead?
src/components/ui/progress.tsx(7,3): error TS2339: Property
  'indicatorClassName' does not exist on type 'HTMLAttributes<HTMLDivElement>
  & { value?: number | null | undefined; }'.
```

Cause 1: `app/page.tsx` does `import { Hero } from "@/components/Hero"` but
`components/Hero.tsx` ends with `export default Hero;` only.

Cause 2: `ui/progress.tsx` destructures an `indicatorClassName` prop that is
not declared in its props type. It is also never used in the body.

Turbopack compiles the bundle successfully ("Compiled successfully in 3.0s");
only the type check fails. Runtime in `next dev` therefore roughly works,
which is how the earlier screenshots were produced, but `next build` is
blocked. **This is why the previous "build verified" claim is false.**

## 3. The Home hero — what is actually implemented

`web/src/components/Hero.tsx` (client component):

- Picks **one** upcoming fixture passed from the server page.
- Shows each club as `CrestItem`: a `TeamCrest` circle + an 11px uppercase
  team name. There is **no match headline** — the fixture is never written as
  "Malaga vs Racing Santander" in large type.
- Three `OutcomeBlock`s: a count-up numeral (64–128px, Newsreader, coloured by
  outcome), a percentage label, and a thin proportion bar. Desktop uses a
  3-column grid, mobile stacks them. The same markup is duplicated twice
  (grid + mobile) rather than one responsive layout.
- Bottom row: "Most likely score" `1–1`, `P = 0.102`, and a blend line
  `0.48 / 0.26 / 0.27` in volt.
- Background: a WebGL2 `RippleGrid` canvas configured with
  `mouseInteraction={false}` and `glow={0}`, plus a CSS `hero-fine-grid`
  hairline overlay — i.e. two grids stacked, and the ripple is effectively
  static.
- Cursor lighting: a `window` `mousemove` listener calls `setMousePosition`
  on every event, which re-renders the whole hero and rebuilds an inline
  multi-stop radial-gradient string. This is the "cursor-reactive" effect; it
  works but is the most expensive thing on the page and is not throttled.

`design-check/hero-desktop.png` and `hero-mobile.png` show a **white page**
with a black nav bar, a nearly invisible lime "LIVE FORWARD" pill, initials
circles instead of crests, and a clipped scoreline at the bottom edge. They do
not represent the current dark tokens, and they are the only visual evidence
that exists. Treat them as broken artefacts, not as a reference.

## 4. Fixture selection bug — confirmed

`web/src/lib/fixtures.ts` → `nextUpcomingFixture()`:

```ts
const rows = readUpcomingPredictions()
  .filter((r) => (r.prediction_type || "") === "live_forward")
  .filter((r) => r.p_blend_h > 0 && r.p_blend_d > 0 && r.p_blend_a > 0);
// ...
return rows.reduce((best, r) => (rDate < bestDate ? r : best));
```

It selects the **earliest** fixture and never compares against today's date.
There is no `>= today` filter anywhere in the file. So:

- On 2026-11-07, when `upcoming_predictions.csv` still contained
  `2026-11-06 Sevilla vs Deportivo Alaves`, the hero showed a match that had
  already been played. That is exactly the reported bug.
- The current CSV no longer contains the Sevilla row (it was regenerated at
  14:22), so today the hero would land on `2026-11-07 Malaga vs Racing
  Santander` by luck, not by logic. **The bug is latent, not fixed.**

`DESIGN.md` claims this was fixed ("Hero now filters out past fixtures"). The
code says otherwise.

Design consequence to decide: the fixture list is a frozen snapshot with no
future dates beyond 2026-11-08. A hard `>= today` filter will render an empty
hero from 2026-11-09 onward. The honest behaviour is: filter to today or
later, and when nothing remains, show a clearly labelled "snapshot from
2026-11-07, no unplayed fixtures in it — re-run the export" state. Never fall
back to a past match.

## 5. Crests — confirmed missing, cause identified

- `web/public/` contains only the Create-Next-App defaults:
  `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`.
- `TeamCrest.tsx` contains **no image markup at all** — no `next/image`, no
  `<img>`, no asset path, no lookup table. It renders a coloured circle with
  up to three initials (`"Sevilla"` → `S`, `"Deportivo Alaves"` → `DA`).
- `DESIGN.md` §8 and the previous status block both claim real Wikimedia
  Commons crests with a licence registry. **No such assets or registry exist.**

Root cause: the crest work was never done; the component shipped with only
its fallback path. This is not a path/loading/matching problem — there is
nothing to load.

Fallback quality today: initials + club colour works and is consistent, but
the colour table has issues — `Real Madrid` is `#febe10` (yellow) with white
initials, which is low contrast, and several clubs share the same blue
(`Almeria`, `Elche`, `Real Sociedad` all `#0067b1`).

## 6. Design-system state

`web/src/app/globals.css` — Tailwind v4 `@theme` block:

- Dark tokens present: `pine-950 #060c09`, `pine-900 #0c1410`,
  `pine-800 #121b15`, `pine-100 #edf4ee`, `pine-400 #8ca296`.
- Accent `volt #d9ff3f`; outcomes `home #34d399`, `draw #f5c451`,
  `away #ff4d24`.
- **Light-theme leftovers still defined**: `bone`, `bone-surface`,
  `ink-light`, `muted-light`, `accent-light`, plus `home-light`, `draw-light`,
  `away-light`. Unused, but they contradict "dark only" and invite drift.
- `body` is dark with Archivo; headings use Newsreader. ✅
- `.hero-fine-grid` hairline grid utility. ✅

`web/src/app/layout.tsx` — Newsreader and Archivo loaded via `next/font/google`
with CSS variables. ✅ **Font choices already implemented; do not change.**

`web/src/components/SiteNav.tsx` — sticky, blurred bar. Contains
`<Badge>LIVE</Badge>` (default variant = volt text on 10% volt background) and
`La Liga · Season 2026/27`. "LIVE" is **inaccurate** — the predictions are a
static snapshot. `DESIGN.md` says this was replaced with "PREDICTION"; it was
not in the nav.

shadcn: `components.json` configured (new-york, neutral, RSC, `@/components/ui`,
`@react-bits` registry). Implemented components: `button`, `badge`, `card`,
`progress`, `tooltip`. `ui/card.tsx` uses a class `rounded-16` that is not a
Tailwind utility, and `badge.tsx` references `pine-700` / `pine-300` which are
not defined in the theme (latent, currently unused variants).

## 7. What is not built

- `/fixtures`, `/match/[id]`, `/models` — absent. `src/app` contains only
  `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`.
- FastAPI — no Python web server file exists anywhere.
- Calibration chart, per-season charts, bookmaker comparison UI — absent.
  Source data for these exists in `reports/`
  (`calibration_bins.csv`, `per_season_metrics_final.csv`,
  `test_metrics_final.csv`, `paired_tests_final.csv`, `bookmaker_segments.csv`),
  so the models page is buildable from real numbers later.
- GSAP / Lenis integration — installed, unused.

## 8. Things that are genuinely fine — do not rewrite

- Dixon-Coles / CatBoost / blend pipeline in `src/`.
- `DATA_CONTRACT.md` semantics; blend = 0.35 CatBoost + 0.65 DC.
- CSV parsing in `lib/fixtures.ts` (hand-rolled but adequate; no team name has
  a comma).
- Font loading, dark colour tokens, `prefers-reduced-motion` handling in
  `RippleGrid` and via `useReducedMotion` in the hero.
- `RippleGrid.tsx` itself is a complete, self-contained WebGL component.
