import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const BASE = 'http://127.0.0.1:4173';

function start() {
  return spawn('node', ['server/index.mjs'], { env: { ...process.env, RESULTS_REFRESH_MIN: '0' }, stdio: 'ignore' });
}

// 1. Normal start
const proc = start();
await sleep(2000);
const r1 = await fetch(`${BASE}/api/health`);
console.log('startup:', r1.status);

// 2. Hard kill (SIGKILL) — simulates crash, not graceful shutdown
proc.kill('SIGKILL');
await sleep(1000);

// 3. Restart from cold
const proc2 = start();
await sleep(2000);
const r2 = await fetch(`${BASE}/api/health`);
const body = await r2.json();
console.log('restart:', r2.status, JSON.stringify(body).slice(0,100));

// 4. Data integrity after restart (DB is on disk, must survive)
const f = await fetch(`${BASE}/api/fixtures`);
const data = await f.json();
console.log('fixtures after restart:', data.fixtures.length);

proc2.kill('SIGKILL');
process.exit(0);
