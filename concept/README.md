# Calibra — La Liga forecast concept

A standalone, frontend-only design prototype for an alternative La Liga forecast site. It lives entirely inside this `concept/` folder and is not wired into the existing Next.js app under `web/`.

## Preview

From the repository root:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173/concept/>.

There is no build step, no package install, no API and no database. The site is plain HTML, CSS and JavaScript.

## What is inside

- `index.html` — home / dashboard
- `fixtures.html` — searchable, filterable, sortable fixture browser
- `match.html` — match detail with outcome probabilities and an interactive scoreline field
- `models.html` — model cabinet with keyboard-accessible tabs and comparison bars
- `performance.html` — metric tabs, season charts, calibration and weak spots
- `about.html` — method, boundaries, design resources and craft notes
- `assets/css/concept.css` — the design system and all responsive styles
- `assets/js/data.js` — local illustrative teams, fixtures, models and metrics
- `assets/js/app.js` — all local interactions and SVG charts
- `assets/fonts/` — self-hosted Instrument Sans and Instrument Serif (SIL OFL)
- `assets/favicon.svg` — the mark

## Illustrative data

Every team, fixture, probability, model score and performance number is hardcoded mock data. The scoreline grid is derived locally from mock expected goals using a Poisson distribution. Nothing is fetched from the existing predictor, its model, its database or any external service.

## Design resources

- [Apple Design Skill — dickwu](https://github.com/dickwu/apple-design-skill)
- [Apple Design — Emil Kowalski](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)
- [Apple Creative Design System — Smart Coder Labs](https://github.com/smart-coder-labs/design-system/)
- [Superfuture Design Review](https://www.ui-skills.com/skills/superfuture/design-review)

## Design review

The build was checked against the Superfuture rubric: hierarchy, typography, spacing, colour and contrast, motion, component states, accessibility, responsiveness, copy and consistency. The review pass fixed heading order on the home page, full-bleed panel overflow at 320–360px and touch targets below 44px, and tightened entrance animations that ran longer than the rubric recommends. It also verified the skip-link reveal, mobile-dock blur under reduced transparency, focus rings, reduced motion and increased contrast. Contrast was measured at AA or better in light and dark themes.

## Isolation

The existing website under `web/` was not modified. This prototype has its own assets, data and interactions, and can be deleted by removing the `concept/` folder.
