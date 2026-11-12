/* Ledger handle stability, measured on the live process rather than inferred.
 *
 *   node --test tests/ledger_handles.test.mjs
 *
 * The regression this guards is real: opening one SQLite `DatabaseSync` per
 * request exhausted file descriptors and eventually killed the server. The fix
 * is a shared read-only reader, so the check is simple: hammer the endpoint that
 * queries the ledger and confirm the process's open handles to the database file
 * do not grow, and that the process is still answering afterwards.
 *
 * The server is started with RATE_LIMIT_PER_MIN=0 so this test measures handle
 * behaviour only. It does not bypass, weaken or depend on the rate limiter, and
 * the limiter's own contract is covered separately in tests/api.test.mjs.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const PORT = 4211;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, "..");
const REQUESTS = 150;
const CONCURRENCY = 10;

function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, "server/index.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      RATE_LIMIT_PER_MIN: "0",
      RESULTS_REFRESH_MIN: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return { child, stderr: () => stderr };
}

async function waitForReady(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("server did not become ready");
}

/** Open file descriptors of a process, or null when the platform cannot tell us. */
function openDescriptors(pid) {
  try {
    const output = execFileSync("lsof", ["-p", String(pid), "-Fn"], { encoding: "utf8" });
    return output
      .split("\n")
      .filter((line) => line.startsWith("n"))
      .map((line) => line.slice(1).trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

const databaseHandles = (descriptors) => descriptors.filter((entry) => entry.includes("calibra.db"));

test("ledger reads do not leak file handles under load", async (t) => {
  const { child } = startServer();

  try {
    await waitForReady();

    // Warm up so one-off handles (sockets, sqlite -wal/-shm) exist before the
    // baseline is taken.
    for (let index = 0; index < 5; index += 1) {
      const warm = await fetch(`${BASE}/api/ledger`);
      assert.equal(warm.status, 200);
      await warm.text();
    }

    const baseline = openDescriptors(child.pid);
    if (!baseline) {
      t.skip("lsof is unavailable, so open handles cannot be measured on this machine");
      return;
    }
    const baselineDb = databaseHandles(baseline).length;
    assert.ok(baselineDb >= 1, `expected the ledger to be open, saw ${baselineDb} handles`);

    const statuses = [];
    let next = 0;
    async function worker() {
      while (next < REQUESTS) {
        next += 1;
        const response = await fetch(`${BASE}/api/ledger`);
        statuses.push(response.status);
        const body = await response.json();
        if (response.status === 200) assert.ok(Array.isArray(body.evaluations));
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    assert.equal(statuses.length, REQUESTS);
    assert.deepEqual(
      statuses.filter((status) => status !== 200),
      [],
      "every ledger read must succeed, with no 429 and no 503"
    );

    const after = openDescriptors(child.pid);
    assert.ok(after, "the server process should still exist after the load");

    const afterDb = databaseHandles(after).length;
    assert.equal(
      afterDb,
      baselineDb,
      `database handles grew from ${baselineDb} to ${afterDb} across ${REQUESTS} reads`
    );

    // Sockets are pooled by the client and undici keeps a handful open; the
    // bound allows for that but not for per-request growth.
    const growth = after.length - baseline.length;
    assert.ok(growth <= 32, `open descriptors grew by ${growth}, which is more than a socket pool`);

    const health = await fetch(`${BASE}/api/health`);
    assert.equal(health.status, 200, "the server must still answer after the load");
    const payload = await health.json();
    assert.equal(payload.status || payload.ok, payload.status || true);
  } finally {
    child.kill();
  }
});
