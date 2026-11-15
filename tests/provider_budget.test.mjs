import assert from "node:assert/strict";
import test from "node:test";

import { allow, createBudget, record } from "../server/lib/provider-budget.mjs";

test("hourly budget blocks the 61st call and resets next hour", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const b = createBudget({ hourly: 60 });
  for (let i = 0; i < 60; i += 1) record(b, now, { ok: true });
  assert.equal(allow(b, now).ok, false);
  assert.equal(allow(b, now).reason, "hourly budget");
  assert.equal(allow(b, now + 3600000).ok, true);
});

test("two failures trigger a five minute backoff; success clears it", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const b = createBudget();
  record(b, now, { ok: false });
  assert.equal(allow(b, now).ok, true);
  record(b, now, { ok: false });
  assert.equal(allow(b, now).ok, false);
  assert.equal(allow(b, now + 300000).ok, true);
  record(b, now + 300000, { ok: true });
  assert.equal(b.failures, 0);
});
