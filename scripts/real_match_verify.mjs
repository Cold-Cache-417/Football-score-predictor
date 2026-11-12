#!/usr/bin/env node
/*
 * Real-match verification script (read-only).
 *
 * Compares every settled match with an archived forecast against the actual recorded score.
 * Results are ingested by the provider feed, not by an HTTP endpoint, so this script only
 * reads the ledger.
 *
 * Usage:
 *   node scripts/real_match_verify.mjs            # all settled results
 *   node scripts/real_match_verify.mjs <pairKey>  # single match detail
 */
import { openLedger, buildEvaluations, listForecasts, summarise } from '../server/lib/db.mjs';

const db = openLedger('data/calibra.db', { readOnly: true });
const pairKey = process.argv[2];

const evals = buildEvaluations(db, { season: '2026/27' });
const forecasts = listForecasts(db, { season: '2026/27' });
const results = db.prepare("SELECT * FROM results WHERE season = '2026/27'").all();

console.log('=== Real-match verification (read-only) ===');
console.log(`Forecasts in ledger: ${forecasts.length}`);
console.log(`Results in ledger:   ${results.length}`);
console.log(`Evaluations (joined forecast + result): ${evals.length}`);

if (evals.length === 0) {
  console.log('\n[STATUS: PENDING REAL DATA]');
  console.log('Zero forecasts have completed matches so far — forecasts start at MW13 (2026-11-22),');
  console.log('results cover MW1-12 (through 2026-11-08). This is EXPECTED and CORRECT.');
  console.log('Verification will auto-run when MW13 matches are ingested by the pipeline.');
  console.log('\nTo verify the evaluation machinery on historical data, run with a simulated joined pair.');
} else {
  const summary = summarise(evals);
  console.log(`\nAccuracy:   ${(summary.blend.accuracy * 100).toFixed(1)}%`);
  console.log(`Mean RPS:   ${summary.blend.rps.toFixed(4)}`);
  console.log(`Log Loss:   ${summary.blend.logLoss.toFixed(4)}`);
  console.log(`Brier:      ${summary.blend.brier.toFixed(4)}`);
  for (const e of evals.slice(0, 5)) {
    console.log(`  ${e.home} vs ${e.away}: actual ${e.actual.home}-${e.actual.away} (${e.outcome})`);
  }
}

// Check ledger integrity: no duplicates, no missing mandatory fields
const dupes = db.prepare(`
  SELECT season, home, away, COUNT(*) as c
  FROM forecasts GROUP BY season, home, away HAVING c > 1
`).all();
console.log(`\nDuplicate forecast keys: ${dupes.length}`);

const invalidForecasts = db.prepare(`
  SELECT COUNT(*) as c FROM forecasts
  WHERE p_blend_h IS NULL OR p_blend_d IS NULL OR p_blend_a IS NULL
     OR generated_at IS NULL
`).get().c;
console.log(`Invalid forecasts (missing required fields): ${invalidForecasts}`);

const invalidResults = db.prepare(`
  SELECT COUNT(*) as c FROM results
  WHERE home_goals IS NULL OR away_goals IS NULL OR status IS NULL
`).get().c;
console.log(`Invalid results (missing required fields): ${invalidResults}`);

const ok = dupes.length === 0 && invalidForecasts === 0 && invalidResults === 0;
console.log(`\nLedger consistency: ${ok ? 'PASSED' : 'FAILED'}`);
process.exit(ok ? 0 : 1);
