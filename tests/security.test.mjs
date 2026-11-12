/* Security regressions for the static resolver, the public-data policy, the
 * ledger connection and the API's hardening.
 *
 *   node --test tests/security.test.mjs
 *
 * Boots the real server and sends raw request paths, because fetch() would
 * normalise some of these before they reached the server.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test, { after, before, describe } from "node:test";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB = path.join(ROOT, "data/calibra.db");

function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, "server/index.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      RESULTS_REFRESH_MIN: "0",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return { child, stderr: () => stderr };
}

async function waitForReady(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("server did not become ready");
}

/** Send a request without letting the client normalise the path. */
function get(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({ status: response.statusCode, headers: response.headers, body })
        );
      }
    );
    request.on("error", reject);
    request.end();
  });
}

function send(port, pathname, method) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, path: pathname, method },
      (response) => {
        response.resume();
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers }));
      }
    );
    request.on("error", reject);
    request.end();
  });
}

function ledgerHandles(pid) {
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("lsof", ["-p", String(pid)], { encoding: "utf8" });
      return out.split("\n").filter((line) => line.includes("calibra.db")).length;
    } catch {
      return null;
    }
  }
  try {
    const dir = `/proc/${pid}/fd`;
    return fs
      .readdirSync(dir)
      .map((fd) => {
        try {
          return fs.readlinkSync(path.join(dir, fd));
        } catch {
          return "";
        }
      })
      .filter((target) => target.includes("calibra.db")).length;
  } catch {
    return null;
  }
}

describe("static file security", () => {
  const PORT = 4201;
  let child;
  let stderr;

  before(async () => {
    // Rate limiting is exercised in its own suite; here it would mask the
    // handle-count regression.
    const started = startServer(PORT, { RATE_LIMIT_PER_MIN: "0" });
    child = started.child;
    stderr = started.stderr;
    await waitForReady(PORT);
  });

  after(() => child.kill("SIGTERM"));

  test("traversal attempts never leave the public roots", async () => {
    const vectors = [
      "/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "/assets%2f..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd",
      "/assets/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "/assets%252f..%252f..%252f..%252f..%252f..%252f..%252fetc%252fpasswd",
      "/%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd",
      "/assets%5c..%5c..%5c..%5c..%5c..%5c..%5cetc%5cpasswd",
      "/assets/..\\..\\..\\..\\..\\..\\etc\\passwd",
      "/../../../../etc/passwd",
      "/etc/passwd",
      "/assets%00.png",
      "/assets/%00",
      "/%zz",
      "/%",
      "/assets%2f..%2f..%2fweb-classic%2f.env.local",
      "/assets%2f..%2f..%2f.env.local",
      "/data/../data/website/scorelines/../../../etc/passwd"
    ];
    for (const vector of vectors) {
      const response = await get(PORT, vector);
      assert.equal(response.status, 404, `${vector} should be 404, got ${response.status}`);
      assert.doesNotMatch(response.body, /root:|API_FOOTBALL|BEGIN [A-Z ]*PRIVATE KEY|bin\/bash/);
    }
    const malformed = await get(PORT, "/%zz");
    assert.notEqual(malformed.status, 500);
  });

  test("private data and secrets are not served", async () => {
    const privatePaths = [
      "/data/calibra.db",
      "/data/calibra.db-wal",
      "/data/raw/SP1_2627.csv",
      "/data/raw/schedule_2627.json",
      "/data/raw/api_results_2627.json",
      "/data/website/season_results.csv",
      "/data/website/upcoming_predictions.csv",
      "/data/website/test_predictions.csv",
      "/data/website/upcoming_scorelines.parquet",
      "/reports/test_metrics_final.csv",
      "/reports/live_learning.md",
      "/web-classic/.env.local",
      "/.env.local",
      "/.env"
    ];
    for (const target of privatePaths) {
      const response = await get(PORT, target);
      assert.equal(response.status, 404, `${target} should not be served (got ${response.status})`);
    }
  });

  test("public assets and the intended grid export still work", async () => {
    const asset = await get(PORT, "/assets/css/concept.css");
    assert.equal(asset.status, 200);
    assert.match(asset.headers["content-type"], /text\/css/);

    const script = await get(PORT, "/assets/js/app.js");
    assert.equal(script.status, 200);
    assert.match(script.headers["content-type"], /javascript/);

    const crest = await get(PORT, "/assets/crests/barcelona.png");
    assert.equal(crest.status, 200);
    assert.match(crest.headers["content-type"], /image\/png/);

    const grid = await get(PORT, "/data/website/scorelines/m-2026-11-22-ala-dep.json");
    assert.equal(grid.status, 200);
    assert.equal(JSON.parse(grid.body).grid.length, 15);

    const home = await get(PORT, "/");
    assert.equal(home.status, 200);
    assert.match(home.body, /<\/html>/);
  });

  test("200 ledger reads do not leak database handles", async (t) => {
    const before = ledgerHandles(child.pid);
    if (before == null) {
      t.skip("handle counting unavailable on this platform");
      return;
    }

    const source = new DatabaseSync(DB, { readOnly: true });
    const expected = source.prepare("SELECT COUNT(*) AS n FROM forecasts").get().n;
    source.close();

    let lastBody = null;
    for (let i = 0; i < 200; i += 1) {
      const response = await get(PORT, "/api/ledger");
      assert.equal(response.status, 200, `ledger request ${i} returned ${response.status}`);
      lastBody = JSON.parse(response.body);
    }
    const afterCount = ledgerHandles(child.pid);

    assert.equal(lastBody.season, "2026/27");
    assert.equal(lastBody.forecasts, expected, "endpoint should report every stored forecast");
    assert.equal(typeof lastBody.record.matches, "number");
    assert.ok(Array.isArray(lastBody.evaluations));

    assert.ok(
      afterCount <= before + 2,
      `database handles grew from ${before} to ${afterCount} across 200 requests`
    );
    assert.equal(child.exitCode, null, `server exited: ${stderr()}`);
    assert.doesNotMatch(stderr(), /URIError|ERR_HTTP_HEADERS_SENT|ReadableStream is locked/);
  });
});

describe("api hardening", () => {
  const PORT = 4202;
  let child;

  before(async () => {
    const started = startServer(PORT, { RATE_LIMIT_PER_MIN: "0" });
    child = started.child;
    await waitForReady(PORT);
  });

  after(() => child.kill("SIGTERM"));

  test("security headers are present and CSP is enforced", async () => {
    const page = await get(PORT, "/");
    assert.match(page.headers["content-security-policy"] || "", /default-src 'self'/);
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.equal(page.headers["x-frame-options"], "DENY");
    assert.match(page.headers["referrer-policy"] || "", /strict-origin/);

    const api = await get(PORT, "/api/health");
    assert.match(api.headers["content-security-policy"] || "", /frame-ancestors 'none'/);
  });

  test("unsupported methods are rejected", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await send(PORT, "/api/fixtures", method);
      assert.equal(response.status, 405, `${method} should be 405`);
      assert.match(response.headers.allow || "", /GET/);
    }
  });

  test("query parameters are validated", async () => {
    const bad = await get(PORT, "/api/ledger?season=not-a-season");
    assert.equal(bad.status, 400);
    const good = await get(PORT, "/api/ledger?season=2026%2F27");
    assert.equal(good.status, 200);
  });

  test("fixtures answers conditional requests with 304", async () => {
    const first = await get(PORT, "/api/fixtures");
    assert.equal(first.status, 200);
    const etag = first.headers.etag;
    assert.ok(etag, "fixtures should send an ETag");
    const second = await get(PORT, "/api/fixtures", { "if-none-match": etag });
    assert.equal(second.status, 304);
    assert.equal(second.body, "");
  });

  test("health is consistent with the live API", async () => {
    const health = JSON.parse((await get(PORT, "/api/health")).body);
    const live = JSON.parse((await get(PORT, "/api/live")).body);
    assert.ok(["ok", "stale", "error", "unconfigured", "unknown"].includes(health.live.state));
    assert.ok(["ok", "stale", "error", "unconfigured"].includes(live.state));
    assert.equal(health.provider.configured, live.provider.configured);
    assert.equal(typeof health.ledger.forecasts, "number");
    assert.ok(health.ledger.forecasts > 0);
  });

});

describe("rate limiting", () => {
  const PORT = 4203;
  let child;

  before(async () => {
    const started = startServer(PORT, { RATE_LIMIT_PER_MIN: "3" });
    child = started.child;
    await waitForReady(PORT);
  });

  after(() => child.kill("SIGTERM"));

  test("a client over budget is throttled, not served", async () => {
    let throttled = null;
    for (let i = 0; i < 10; i += 1) {
      const response = await get(PORT, "/api/health");
      if (response.status === 429) {
        throttled = response;
        break;
      }
    }
    assert.ok(throttled, "expected a 429 once the per-minute budget was spent");
    assert.equal(throttled.headers["retry-after"], "60");
    // Static assets are not part of the API budget and stay available.
    const page = await get(PORT, "/index.html");
    assert.equal(page.status, 200);
  });
});

test("forecast immutability is preserved", (t) => {
  const copy = path.join(os.tmpdir(), `calibra-immutable-${process.pid}.db`);
  try {
    execFileSync("sqlite3", [DB, `.backup '${copy}'`], { stdio: "ignore" });
  } catch {
    t.skip("sqlite3 CLI unavailable to copy the ledger");
    return;
  }
  try {
    const db = new DatabaseSync(copy);
    const row = db.prepare("SELECT pair_key FROM forecasts LIMIT 1").get();
    assert.ok(row, "the ledger should contain at least one forecast");
    assert.throws(
      () => db.prepare("UPDATE forecasts SET p_blend_h = 0.5 WHERE pair_key = ?").run(row.pair_key),
      /immutable/
    );
    assert.throws(
      () => db.prepare("DELETE FROM forecasts WHERE pair_key = ?").run(row.pair_key),
      /immutable/
    );
    const afterWrite = db.prepare("SELECT COUNT(*) AS n FROM forecasts").get().n;
    assert.ok(afterWrite > 0, "forecasts must survive the rejected writes");
    db.close();
  } finally {
    fs.rmSync(copy, { force: true });
  }
});
