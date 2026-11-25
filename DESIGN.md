# DESIGN.md — Calibra theme lock

**Purpose:** this file freezes the shipped brand so the Phase 3 makeover changes craft, not identity.
Anything marked **LOCKED** must not change without the owner's explicit approval.

Source of truth: `web/assets/css/concept.css` (`:root` at line 1, dark overrides at line 248),
`web/*.html`, `web/assets/js/app.js`, `web/assets/js/data-live.js`.

---

## 1. Product

**Calibra** — an independent La Liga forecast site for a private audience of friends.
It publishes real results, a walk-forward backtest, bookmaker comparison, and one
forecast per fixture, generated before kick-off. A Premier League page exists behind
the `COMPETITIONS` flag; La Liga must stay byte-identical while the flag is off.

Voice: **broadcast analyst, not SaaS marketing.** Short declaratives. Numbers carry the
sentence. Admit when the bookmaker wins. Never promise winnings.

---

## 2. Colour — LOCKED

Light is the default surface (bone/paper), dark is a true inverted theme, not a tint.
All values are CSS custom properties; never hardcode a hex in a component.

### 2.1 Light surfaces

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f3f1eb` | Page |
| `--bg-2` | `#eae7df` | Page alt band |
| `--surface` | `#ffffff` | Card |
| `--surface-2` | `#f7f5f0` | Nested card |
| `--surface-3` | `#eae7e0` | Inset / track |
| `--ink` | `#111416` | Primary text |
| `--ink-2` | `#1b1f22` | Secondary heading |
| `--muted` | `#5c6469` | Body secondary |
| `--faint` | `#5f686d` | Metadata |
| `--line` | `rgba(17,20,22,.12)` | Hairline |
| `--line-strong` | `rgba(17,20,22,.24)` | Divider / border |

### 2.2 Brand accent — coral

| Token | Value | Role |
|---|---|---|
| `--coral` | `#d93a2e` | Brand accent, chart blend line |
| `--coral-ink` | `#b42318` | Coral text on light surfaces |
| `--coral-soft` | `#fbe6e2` | Coral tint background |
| `--coral-bright` | `#ff6b5e` | Coral on dark surfaces |
| `--on-coral` | `#ffffff` | Text on coral fill |

Coral is the **only** brand accent. It marks the model, the primary action, and the
active state. It is never used for "away wins".

### 2.3 Outcome semantics — LOCKED meanings

| Token | Light | Meaning |
|---|---|---|
| `--home` | `#0a7550` | Home win |
| `--draw` | `#966600` | Draw |
| `--away` | `#2367c9` | Away win |
| `--live` | `#c6281c` | In play |
| `--upcoming` | `#2367c9` | Scheduled |
| `--ft` | `#5c6469` | Full time |
| `--market` | `#8a5a00` | Bookmaker benchmark |
| `--pitch` | `#138a5b` | Pitch/positive data |
| `--pitch-ink` | `#0b6b45` | Pitch text |

Each also has `-soft` (tint) and `-bright` (dark-mode) variants. Outcome colour is
never decorative and never reassigned.

### 2.4 Inverted surfaces

| Token | Value |
|---|---|
| `--inv-bg` | `#0d1113` |
| `--inv-bg-2` | `#141a1d` |
| `--inv-surface` | `#171e21` |
| `--inv-surface-2` | `#1e262a` |
| `--inv-ink` | `#f6f4ee` |
| `--inv-muted` | `#a9b2b7` |
| `--inv-faint` | `#7f8a90` |
| `--inv-line` | `rgba(246,244,238,.14)` |

The hero, footer, and dark theme use these. Dark mode is not a separate palette —
it maps the same roles onto inverted tokens (`:root[data-theme="dark"]`).

---

## 3. Typography — LOCKED

| Token | Stack | Use |
|---|---|---|
| `--font-display` | Barlow Condensed 600/700/800 → Arial Narrow | H1–H3, giant numerals, masthead, score |
| `--font-sans` | Inter 400/500/600 → system | Body, UI, labels |
| `--font-mono` | Roboto Mono → SFMono | Probabilities, deltas, table numbers |

Self-hosted from `web/assets/fonts/`, preloaded in `<head>`; no Google Fonts request.
All figures use `font-variant-numeric: tabular-nums` (already applied 21×).

Rules:
- Display type is condensed and tight (`letter-spacing` negative); never letterspace it wide.
- Body line-height ≥ 1.5; measure ≤ 72ch.
- Mono only for numbers and codes; never for sentences.
- No fourth family. No serif. No gradient text.

---

## 4. Geometry, depth, motion

- Radii: `--radius-xs 6` / `sm 10` / `md 16` / `lg 24` / `xl 32`; pills `999px`.
- Depth: `--shadow-1` (resting card), `--shadow-2` (overlay only). No coloured glow.
- Hairline borders carry structure; shadows are secondary.
- Chrome heights: `--topbar-h 34px`, `--nav-h 68px`, `--dock-h 64px`.
- Easing: `--ease-out cubic-bezier(.16,1,.3,1)`, `--ease-in-out cubic-bezier(.65,0,.35,1)`.
- Motion is functional: state change, list entry, count-up. Durations 120–320ms.
- `@media (prefers-reduced-motion: reduce)` already zeroes animation at line 6031; keep it that way.

---

## 5. Layout system

- Content width: `.wrap` (single container, generous gutters); full-bleed only for the hero and inverted bands.
- Vertical rhythm comes from `.section` padding, not per-element margins.
- Two structural motifs only: **the data table/row list** and **the card grid**. Do not add a third.
- The home hero is a broadcast plate: matchweek number, fixture pair, predicted score,
  kickoff rail. It is the product, not a marketing banner.
- Page set: `index` (matchday), `fixtures`, `history` (record), `how-it-works`, `match`,
  `club`, `models`, `performance`, `about`, `creator`, `404`, plus generated `epl.html`.

---

## 6. Component contract

| Component | Rule |
|---|---|
| Topbar | League + season left, data-source badge, theme toggle right. 34px. |
| Nav | Brand badge + wordmark, 4 links, live chip. Sticky, 68px. |
| `.btn` | One primary (coral) per view. Secondary is outline. No ghost-only actions. |
| `.card` | Surface + hairline + `--shadow-1`. No nested cards beyond one level. |
| Crest | Real crest, `alt=""` because the club name is adjacent; initials fallback when missing. |
| Probabilities | Mono, tabular, one decimal. H/D/A always in that order. |
| Empty state | States the fact and the next step; never a shrug or an emoji. |
| Warning | Factual, dated, no alarm styling beyond `--draw-soft`. |

State is always expressed in **text as well as colour** (W/D/L, "Full time", "Live").

---

## 7. Copy rules

- Sentence case for headings and buttons.
- Numbers before adjectives: "58% of 1,140 held-out matches", not "highly accurate".
- Say "forecast", not "prediction engine"; "backtest", not "AI-powered".
- The bookmaker comparison is mandatory wherever accuracy is claimed.
- Banned: seamless, unleash, revolutionary, next-generation, cutting-edge, effortless,
  game-changing, empower, supercharge, AI-powered, ultimate, world-class, elevate,
  "in today's fast-paced world", and any sentence that could sell a CRM.
- No em dashes in body copy. Use a full stop or a colon. (Existing copy uses them; Phase 3 removes them.)
- Keep the disclaimer: probabilities are estimates, not betting advice.

---

## 8. Accessibility contract (non-negotiable)

- Body text ≥ 4.5:1, large text ≥ 3:1, against its own surface.
- Visible `:focus-visible` ring on every interactive element; never `outline: none` without a replacement.
- Skip link first in tab order; one `<h1>` per page; no skipped heading levels.
- Real `<button>` / `<a>`; no clickable `<div>`.
- Touch targets ≥ 44×44px with ≥ 8px separation.
- Async updates announce via `aria-live="polite"`.
- Tables scroll inside a labelled wrapper, never the page.
- Inputs ≥ 16px font-size to stop iOS zoom.
- `prefers-reduced-motion` honoured.

---

## 9. What Phase 3 may change

Layout composition, spacing rhythm, type scale, component internals, copy, focus states,
empty/error states, responsive behaviour, and micro-interactions.

## 10. What Phase 3 must not change — LOCKED

1. The palette in section 2, including outcome colour meanings.
2. The three font families and their roles.
3. Brand name, wordmark, badge geometry, league positioning ("La Liga predictions").
4. Product claims and the honesty framing (backtest vs live record, bookmaker comparison).
5. La Liga payload bytes while `COMPETITIONS` is off.
6. The `COMPETITIONS` default (off) and any flag activation.
7. Forecast values, model weights, database schema.
8. Page URLs, API paths, and the static rewrite map in `vercel.json`.
