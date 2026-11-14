#!/usr/bin/env node
/**
 * Worst-case provider budget replay.
 *
 *   node scripts/quota_replay.mjs [schedule.json]
 *
 * Replays the settlement cron (minutes 2,12,22,32,42,52) against every match
 * window in the schedule and reports the busiest Madrid day. One poll per live
 * slot plus two reconciliation calls must stay inside the free plan.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCHEDULE = process.argv[2] || path.join(ROOT, "data/raw/schedule_2627.json");
const PRE = 5 * 60 * 1000;
const POST = 135 * 60 * 1000;
const CRON = [2, 12, 22, 32, 42, 52];
const RECONCILIATION = 2;
const DAILY_LIMIT = 100;
const RESERVE = 25;

function madridOffsetMs(instant) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = Object.fromEntries(
    dtf.formatToParts(instant).filter((x) => x.type !== "literal").map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - instant.getTime();
}

function madridToUtc(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [H, M] = (time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, H, M);
  return guess - madridOffsetMs(new Date(guess));
}

const madridDay = (instant) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(instant);

const raw = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
const windows = (raw.matches || [])
  .filter((m) => m.date)
  .map((m) => {
    const kick = madridToUtc(m.date, m.time);
    return { start: kick - PRE, end: kick + POST };
  });

const min = Math.min(...windows.map((w) => w.start));
const max = Math.max(...windows.map((w) => w.end));

const byDay = new Map();
const dayStart = new Date(min);
dayStart.setUTCHours(0, 0, 0, 0);
const firstSlot = dayStart.getTime() + CRON[0] * 60 * 1000;
for (let t = firstSlot; t <= max; t += 10 * 60 * 1000) {
  const d = new Date(t);
  if (!CRON.includes(d.getUTCMinutes())) continue;
  if (!windows.some((w) => t >= w.start && t <= w.end)) continue;
  const day = madridDay(d);
  byDay.set(day, (byDay.get(day) || 0) + 1);
}

const ranked = [...byDay.entries()]
  .map(([day, polls]) => ({ day, polls, calls: polls + RECONCILIATION }))
  .sort((a, b) => b.calls - a.calls);

const worst = ranked[0];
console.log("Worst-case provider budget replay");
console.log(`schedule: ${path.relative(ROOT, SCHEDULE)}  windows: ${windows.length}`);
console.log(`cron: minutes ${CRON.join(",")}  reconciliation calls: ${RECONCILIATION}`);
console.log("");
for (const r of ranked.slice(0, 5)) {
  console.log(`  ${r.day}  live polls ${String(r.polls).padStart(3)}  total calls ${String(r.calls).padStart(3)}`);
}
console.log("");
if (!worst) {
  console.log("No live slots found — schedule may be empty.");
  process.exit(1);
}
console.log(`Worst day: ${worst.day} — ${worst.calls}/${DAILY_LIMIT} calls, ${DAILY_LIMIT - worst.calls} spare`);
const pass = worst.calls <= 57 && DAILY_LIMIT - worst.calls >= RESERVE;
console.log(pass ? "PASS: worst day stays within the 57-call model and the 25-call reserve" : "FAIL: worst day exceeds the budget model");
process.exit(pass ? 0 : 1);
