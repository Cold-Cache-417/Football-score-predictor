import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("Issue 3: Provider attribution URLs are competition-specific, not generic", () => {
  const competitions = fs.readFileSync(path.join(process.cwd(), "server/lib/competitions.mjs"), "utf8");
  assert.match(competitions, /fotmob\.com\/league/, "competitions.mjs MUST use competition-specific FotMob league URLs");
  assert.match(competitions, /espn\.com\/soccer\/\w+\./, "competitions.mjs MUST use competition-specific ESPN league slugs");

  const refreshScript = fs.readFileSync(path.join(process.cwd(), "scripts/refresh_providers.mjs"), "utf8");
  assert.match(refreshScript, /providerUrls/, "refresh_providers.mjs MUST have a providerUrls helper");
  assert.match(refreshScript, /urls\[provider\.id\]/, "refresh_providers.mjs MUST use providerUrls for attribution URLs");

  const appJs = fs.readFileSync(path.join(process.cwd(), "web/assets/js/app.js"), "utf8");
  assert.match(appJs, /provider\.url/, "app.js MUST render provider URLs from the payload");
});