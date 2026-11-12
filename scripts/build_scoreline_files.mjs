#!/usr/bin/env node
/**
 * Split the converted scoreline dump into one JSON file per fixture.
 *
 *   .venv/bin/python scripts/export_scorelines_json.py
 *   node scripts/build_scoreline_files.mjs
 *
 * Slugs come from the server's own team registry, so a fixture id here is
 * byte-identical to the id the API serves. Conversion only — no model maths.
 */
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "../server/lib/data.mjs";
import { slugFor } from "../server/lib/teams.mjs";

const RAW = path.join(ROOT, "data/website/scorelines_raw.json");
const OUT = path.join(ROOT, "data/website/scorelines");
const SIZE = 15;

if (!fs.existsSync(RAW)) {
  console.error(`missing ${RAW} — run scripts/export_scorelines_json.py first`);
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(RAW, "utf8"));
fs.mkdirSync(OUT, { recursive: true });

let written = 0;
const skipped = [];
for (const row of rows) {
  const home = slugFor(row.home);
  const away = slugFor(row.away);
  if (!home || !away) {
    skipped.push(`${row.home} v ${row.away}`);
    continue;
  }
  if (!Array.isArray(row.grid) || row.grid.length !== SIZE * SIZE) {
    skipped.push(`${row.home} v ${row.away} (bad grid)`);
    continue;
  }
  const fixtureId = `m-${row.date}-${home}-${away}`;
  const matrix = Array.from({ length: SIZE }, (_, i) => row.grid.slice(i * SIZE, (i + 1) * SIZE));
  const payload = {
    fixtureId,
    generatedAt: row.generatedAt,
    grid: matrix,
    top: row.top && row.top.length ? row.top : [{ home: 1, away: 1, p: 0 }]
  };
  fs.writeFileSync(path.join(OUT, `${fixtureId}.json`), JSON.stringify(payload));
  written += 1;
}

fs.unlinkSync(RAW);
console.log(`scorelines: ${written} fixtures written to data/website/scorelines/`);
if (skipped.length) console.warn(`skipped ${skipped.length}: ${skipped.slice(0, 5).join(", ")}`);
