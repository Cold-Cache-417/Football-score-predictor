import { copyFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLedger, buildEvaluations, recordResult, summarise } from '../server/lib/db.mjs';

const tmp = join(tmpdir(), `calibra-sim-${Date.now()}.db`);
copyFileSync('data/calibra.db', tmp);
const db = openLedger(tmp);

const fc = db.prepare("SELECT * FROM forecasts ORDER BY kickoff_utc LIMIT 1").get();
console.log(`Simulating result for: ${fc.pair_key} (${fc.home} vs ${fc.away})`);

recordResult(db, {
  pairKey: fc.pair_key,
  fixtureId: fc.fixture_id,
  season: fc.season,
  matchweek: fc.matchweek,
  kickoffUtc: fc.kickoff_utc,
  home: fc.home,
  away: fc.away,
  homeGoals: 3,
  awayGoals: 1,
  status: 'FT',
  source: 'simulated_test',
  marketH: 0.50,
  marketD: 0.30,
  marketA: 0.20
});

const evals = buildEvaluations(db, { season: fc.season });
console.log(`Evaluations count: ${evals.length}`);
const s = summarise(evals);
console.log('Metrics calculated:', JSON.stringify(s.blend, null, 2));

db.close();
unlinkSync(tmp);
console.log('\nSimulated verification: PASSED');
