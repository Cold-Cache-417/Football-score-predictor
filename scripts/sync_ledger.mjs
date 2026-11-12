#!/usr/bin/env node
/**
 * Import the pipeline exports into the prediction ledger.
 *
 *   node scripts/sync_ledger.mjs
 *
 * Forecasts are write-once: running this again never changes a stored row.
 * Results may be corrected; each change is appended to result_revisions.
 */
import path from "node:path";

import { openLedger, buildEvaluations, summarise } from "../server/lib/db.mjs";
import { syncLedger } from "../server/lib/ledger-sync.mjs";
import { ROOT } from "../server/lib/data.mjs";

const db = openLedger(path.join(ROOT, "data/calibra.db"));
const summary = syncLedger(db);

console.log(
  `forecasts: ${summary.forecasts.exported} in export, ${summary.forecasts.inserted} newly recorded, ` +
    `${summary.forecasts.alreadyRecorded} already in the ledger (export ${summary.forecasts.generatedAt})`
);
console.log(
  `results:   ${summary.results.seen} rows, ${summary.results.new} new, ` +
    `${summary.results.corrected} corrected, ${summary.results.unchanged} unchanged`
);

const evaluations = buildEvaluations(db, { season: "2026/27" });
const record = summarise(evaluations);
if (record.matches) {
  console.log(
    `season record: ${record.matches} settled forecasts · RPS ${record.rps.toFixed(4)} · ` +
      `accuracy ${record.accuracy.toFixed(1)}% · log loss ${record.logLoss.toFixed(4)}`
  );
} else {
  console.log("season record: no settled forecasts yet (the ledger starts with the next matchweek)");
}
db.close();
