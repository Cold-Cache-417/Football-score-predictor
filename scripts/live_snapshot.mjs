#!/usr/bin/env node
/**
 * Write web/api/live.json from the provider, but only inside a live window.
 *
 *   node scripts/live_snapshot.mjs
 *
 * Outside a window it spends zero API calls and writes state "idle".
 * A missing key or an exhausted budget degrades to "unconfigured"/"unavailable"
 * without breaking the rest of the site.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getLiveFeed } from "../server/lib/live.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "web/api/live.json");
const write = (v) => fs.writeFileSync(OUT, JSON.stringify(v));
const guard = execFileSync(process.execPath, [path.join(ROOT, "scripts/live_window.mjs")], {
  encoding: "utf8"
}).trim();

if (!guard.startsWith("live")) {
  write({ state: "idle", matches: [], updatedAt: null, message: "No fixture in a live window." });
  console.log(`live.json: idle (${guard})`);
  process.exit(0);
}

const feed = await getLiveFeed();
write({
  state: feed.state === "ok" ? "ok" : "unavailable",
  matches: feed.matches || [],
  updatedAt: feed.updatedAt || null,
  message: feed.message || null
});
console.log(`live.json: ${feed.state} (${(feed.matches || []).length} matches, ${guard})`);

