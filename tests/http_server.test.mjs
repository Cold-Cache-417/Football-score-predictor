/* HTTP server contract, including the regression that used to crash it.
 *
 *   node --test tests/http_server.test.mjs
 *
 * Boots the real server on a spare port and exercises text responses big and
 * small. A single failed response must never take the process down.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, "..");

function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, "server/index.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", RESULTS_REFRESH_MIN: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return { child, stderr: () => stderr };
}

async function waitForReady(timeoutMs = 15000) {
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

test("every page, asset and API route answers, and small text bodies do not kill the server", async (t) => {
  const { child, stderr } = startServer();
  t.after(() => {
    child.kill("SIGTERM");
  });
  await waitForReady();

  const pages = [
    "/",
    "/index.html",
    "/fixtures.html",
    "/match.html?id=m-2026-11-22-ala-dep",
    "/models.html",
    "/performance.html",
    "/about.html",
    "/creator.html"
  ];
  for (const page of pages) {
    const response = await fetch(BASE + page);
    assert.equal(response.status, 200, `${page} should be 200`);
    assert.match(response.headers.get("content-type") || "", /text\/html/, `${page} should be HTML`);
    const body = await response.text();
    assert.ok(body.includes("</html>"), `${page} should return a complete document`);
  }

  // Tiny text bodies used to be consumed twice and crash the process.
  const robots = await fetch(`${BASE}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /User-agent/);

  const missing = await fetch(`${BASE}/definitely-not-here`);
  assert.equal(missing.status, 404);

  const smallJson = await fetch(`${BASE}/api/ledger`);
  assert.equal(smallJson.status, 200);

  const fixtures = await fetch(`${BASE}/api/fixtures`);
  assert.equal(fixtures.status, 200);
  const payload = await fixtures.json();
  assert.ok(payload.fixtures.length > 0);
  assert.ok(payload.meta.liveRecord !== undefined);

  const grid = await fetch(`${BASE}/data/website/scorelines/m-2026-11-22-ala-dep.json`);
  assert.equal(grid.status, 200);
  assert.equal((await grid.json()).grid.length, 15);

  // After all of that the process must still be serving.
  const after = await fetch(`${BASE}/api/health`);
  assert.equal(after.status, 200);
  assert.equal(child.exitCode, null, `server exited with ${child.exitCode}: ${stderr()}`);
  assert.doesNotMatch(stderr(), /ERR_HTTP_HEADERS_SENT|ReadableStream is locked/);
});

test("a missing page still serves the site afterwards", async (t) => {
  const { child } = startServer();
  t.after(() => child.kill("SIGTERM"));
  await waitForReady();

  for (const target of ["/nope", "/nope", "/robots.txt", "/", "/nope"]) {
    const response = await fetch(BASE + target);
    assert.ok([200, 404].includes(response.status), `${target} returned ${response.status}`);
    await response.text();
  }
  const still = await fetch(`${BASE}/index.html`);
  assert.equal(still.status, 200);
  assert.equal(child.exitCode, null);
});
