#!/usr/bin/env node
/**
 * Live-window guard. Decides whether a provider poll is worth spending.
 *
 * A fixture counts as live from kickoff-5m to kickoff+135m (90 + half-time +
 * stoppage + settle lag). No fixture in that range means zero API calls.
 *
 *   node scripts/live_window.mjs
 *   node scripts/live_window.mjs --at 2026-09-12T18:00:00Z
 *
 * Prints `live <count>` or `idle` and exits 0 either way.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCHEDULE = path.join(ROOT, "data/raw/schedule_2627.json");
const PRE = 5 * 60 * 1000;
const POST = 135 * 60 * 1000;
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
const atIdx = process.argv.indexOf("--at");
const now = atIdx > -1 ? new Date(process.argv[atIdx + 1]).getTime() : Date.now();

if (!Number.isFinite(now)) {
  console.error("invalid --at value");
  process.exit(2);
}
if (!fs.existsSync(SCHEDULE)) {
  console.log("idle");
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
const live = (raw.matches || []).filter((m) => {
  if (!m.date) return false;
  const kick = madridToUtc(m.date, m.time);
  return now >= kick - PRE && now <= kick + POST;
});

console.log(live.length ? `live ${live.length}` : "idle");

