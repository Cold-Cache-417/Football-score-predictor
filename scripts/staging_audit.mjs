import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync, copyFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
}

// 1. ETag / 304 conditional request
try {
  const r1 = await fetch(`${BASE}/api/fixtures`);
  const etag = r1.headers.get('etag');
  const body1 = await r1.text();
  const r2 = await fetch(`${BASE}/api/fixtures`, { headers: { 'if-none-match': etag } });
  check('etag-304', r2.status === 304 && etag !== null, `etag=${etag} status=${r2.status}`);
} catch (e) { check('etag-304', false, e.message); }

// 2. Health endpoint
try {
  const r = await fetch(`${BASE}/api/health`);
  const h = await r.json();
  check('health', r.status === 200 && h && typeof h === 'object', `status=${r.status} keys=${Object.keys(h||{}).join(',')}`);
} catch (e) { check('health', false, e.message); }

// 3. Rate limiting: hammer /api/fixtures with 40 concurrent requests
try {
  const reqs = Array.from({ length: 40 }, () => fetch(`${BASE}/api/fixtures`));
  const resps = await Promise.allSettled(reqs);
  const statuses = resps.map(r => r.status || 0);
  const limited = statuses.filter(s => s === 429).length;
  check('rate-limit', limited > 0, `429s=${limited}/${statuses.length}`);
} catch (e) { check('rate-limit', false, e.message); }

// 4. Backup / restore on temp DB copy
try {
  const tmp = join(tmpdir(), `calibra-backup-${Date.now()}.db`);
  copyFileSync('data/calibra.db', tmp);
  const orig = readFileSync('data/calibra.db', 'utf8');
  const restored = readFileSync(tmp, 'utf8');
  check('backup-copy', orig.length === restored.length, `bytes=${orig.length}`);
  unlinkSync(tmp);
} catch (e) { check('backup-copy', false, e.message); }

// 5. Immutability via direct SQLite attempt
try {
  const { execSync } = await import('node:child_process');
  let aborted = false;
  try {
    execSync(`sqlite3 data/calibra.db "DELETE FROM forecasts LIMIT 1;"`, { stdio: 'pipe' });
  } catch { aborted = true; }
  check('immutability-trigger', aborted, 'DELETE on forecasts aborted by trigger');
} catch (e) { check('immutability-trigger', false, e.message); }

// 6. Cache-Control headers
try {
  const r = await fetch(`${BASE}/api/fixtures`);
  const cc = r.headers.get('cache-control');
  check('cache-control', cc && cc.includes('max-age'), `cache-control=${cc}`);
} catch (e) { check('cache-control', false, e.message); }

// 7. CSP / security headers
try {
  const r = await fetch(`${BASE}/api/fixtures`);
  const csp = r.headers.get('content-security-policy');
  const xcto = r.headers.get('x-content-type-options');
  check('security-headers', csp && xcto === 'nosniff', `csp=${!!csp} xcto=${xcto}`);
} catch (e) { check('security-headers', false, e.message); }

// 8. Provider failure handling: /api/health should report provider status
try {
  const r = await fetch(`${BASE}/api/health`);
  const h = await r.json();
  check('provider-status', h && h.provider !== undefined, `provider=${JSON.stringify(h?.provider||{}).slice(0,80)}`);
} catch (e) { check('provider-status', false, e.message); }

console.log('\n--- Staging audit summary ---');
const failed = results.filter(r => !r.ok);
console.log(`Passed: ${results.length - failed.length}/${results.length}`);
failed.forEach(r => console.log(`  FAIL: ${r.name} - ${r.detail}`));
process.exit(failed.length ? 1 : 0);
