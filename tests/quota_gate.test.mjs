/* Quota-gate tests. Zero network: every provider response is stubbed, and the
 * persisted counter points at a throwaway file.
 *
 *   node --test tests/quota_gate.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const realFetch = global.fetch;
let seq = 0;

async function loadLive(env = {}) {
  const quotaFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "calibra-quota-")), "quota.json");
  const saved = {};
  const applied = { PROVIDER_QUOTA_FILE: quotaFile, ...env };
  for (const [key, value] of Object.entries(applied)) {
    saved[key] = process.env[key];
    process.env[key] = String(value);
  }
  const mod = await import(`${pathToFileURL(path.join(ROOT, "server/lib/live.mjs")).href}?case=${++seq}`);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return { mod, quotaFile };
}

test.afterEach(() => {
  global.fetch = realFetch;
});

test("unconfigured spends no request", async () => {
  const { mod } = await loadLive();
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error("must not fetch"); };
  const feed = await mod.getLiveFeed();
  assert.equal(feed.state, "unconfigured");
  assert.equal(calls, 0);
});

test("reserve gate blocks before fetch", async () => {
  const { mod } = await loadLive({ PROVIDER_REMAINING: "10", PROVIDER_RESERVE: "25" });
  mod.setApiKey("test-key");
  let calls = 0;
  global.fetch = async () => { calls += 1; return new Response("{}", { status: 200 }); };
  const feed = await mod.getLiveFeed();
  assert.equal(calls, 0);
  assert.match(feed.message, /reserve/);
  assert.equal(mod.budgetStatus().blocked, true);
});

test("missing rate-limit header fails closed", async () => {
  const { mod } = await loadLive({ PROVIDER_REMAINING: "" });
  mod.setApiKey("test-key");
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ response: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const feed = await mod.getLiveFeed();
  assert.equal(feed.state, "ok");
  assert.equal(calls, 1);
  assert.equal(mod.budgetStatus().remaining, 0);
  assert.equal(mod.budgetStatus().blocked, true);
});

test("a readable header updates the budget", async () => {
  const { mod } = await loadLive({ PROVIDER_REMAINING: "80" });
  mod.setApiKey("test-key");
  global.fetch = async () =>
    new Response(JSON.stringify({ response: [] }), {
      status: 200,
      headers: { "content-type": "application/json", "x-ratelimit-requests-remaining": "42" }
    });
  const feed = await mod.getLiveFeed();
  assert.equal(feed.state, "ok");
  assert.equal(mod.budgetStatus().remaining, 42);
  assert.equal(mod.budgetStatus().blocked, false);
});

test("429 starts a cooldown and blocks the next call", async () => {
  const { mod } = await loadLive({ PROVIDER_REMAINING: "80" });
  mod.setApiKey("test-key");
  let calls = 0;
  global.fetch = async () => { calls += 1; return new Response("{}", { status: 429 }); };
  const first = await mod.getLiveFeed();
  assert.match(first.message, /rate limit/);
  const second = await mod.getLiveFeed();
  assert.match(second.message, /cooldown|rate limit/);
  assert.equal(calls, 1);
  assert.ok(mod.quotaStatus().coolingDownUntil);
});

test("daily limit reached blocks before fetch", async () => {
  const { mod } = await loadLive({ PROVIDER_DAILY_LIMIT: "0", PROVIDER_REMAINING: "80" });
  mod.setApiKey("test-key");
  let calls = 0;
  global.fetch = async () => { calls += 1; return new Response("{}", { status: 200 }); };
  const feed = await mod.getLiveFeed();
  assert.match(feed.message, /quota exhausted/);
  assert.equal(calls, 0);
});

test("provider error body is surfaced, not treated as success", async () => {
  const { mod } = await loadLive({ PROVIDER_REMAINING: "80" });
  mod.setApiKey("test-key");
  global.fetch = async () =>
    new Response(JSON.stringify({ errors: { token: "invalid" }, response: [] }), {
      status: 200,
      headers: { "content-type": "application/json", "x-ratelimit-requests-remaining": "79" }
    });
  const feed = await mod.getLiveFeed();
  assert.match(feed.message, /token: invalid/);
});

test("provider timeout degrades without throwing", async () => {
  const { mod } = await loadLive({ PROVIDER_REMAINING: "80" });
  mod.setApiKey("test-key");
  global.fetch = async () => { throw new Error("timeout"); };
  const feed = await mod.getLiveFeed();
  assert.equal(feed.state, "error");
  assert.match(feed.message, /unreachable/);
});
