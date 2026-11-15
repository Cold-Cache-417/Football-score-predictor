/* Provider request budget (Phase 4A).

   "Reasonable technical limits" from the permission terms, expressed as a
   small local guard: calls per hour, calls per day, and a backoff after
   repeated failures. In-memory only; nothing is persisted and nothing here
   touches the ledger. Deterministic: every function takes `now`. */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/* Failure count -> pause length. Highest matching threshold wins. */
const BACKOFF = [
  { failures: 4, ms: 15 * 60 * 1000 },
  { failures: 2, ms: 5 * 60 * 1000 }
];

export function createBudget({ hourly = 60, daily = 400 } = {}) {
  return { hourly, daily, calls: [], failures: 0, blockedUntil: 0 };
}

function prune(budget, now) {
  budget.calls = budget.calls.filter((at) => at > now - DAY_MS);
}

export function allow(budget, now) {
  prune(budget, now);
  if (budget.blockedUntil > now) {
    return { ok: false, reason: "backoff", retryAt: budget.blockedUntil };
  }
  const lastHour = budget.calls.filter((at) => at > now - HOUR_MS).length;
  if (lastHour >= budget.hourly) return { ok: false, reason: "hourly budget" };
  if (budget.calls.length >= budget.daily) return { ok: false, reason: "daily budget" };
  return { ok: true };
}

export function record(budget, now, { ok }) {
  prune(budget, now);
  budget.calls.push(now);
  if (ok) {
    budget.failures = 0;
    budget.blockedUntil = 0;
    return budget;
  }
  budget.failures += 1;
  const step = BACKOFF.find((entry) => budget.failures >= entry.failures);
  if (step) budget.blockedUntil = now + step.ms;
  return budget;
}
