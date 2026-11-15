/* Every crest referenced by the browser registry must exist on disk (both
   leagues), and the generic fallback must stay available. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const WEB = path.resolve(import.meta.dirname, "..", "web");
const source = fs.readFileSync(path.join(WEB, "assets/js/data.js"), "utf8");
const refs = [...source.matchAll(/crest:\s*"([^"]+)"/g)].map((match) => match[1]);

test("all referenced crest files exist", () => {
  assert.equal(refs.length, 40, "20 La Liga + 20 Premier League clubs");
  const missing = refs.filter((ref) => !fs.existsSync(path.join(WEB, ref)));
  assert.deepEqual(missing, []);
});

test("generic fallback is still present", () => {
  assert.ok(fs.existsSync(path.join(WEB, "assets/crests/generic.svg")));
});

test("premier league clubs use real crests, not the fallback", () => {
  const epl = ["ars", "avl", "bou", "bre", "bha", "che", "cov", "cry", "eve", "ful",
    "hul", "ips", "lee", "liv", "mci", "mun", "new", "nfo", "sun", "tot"];
  for (const slug of epl) {
    const line = source.split("\n").find((row) => row.trimStart().startsWith(`${slug}:`));
    assert.ok(line, `${slug} present`);
    assert.match(line, /assets\/crests\/[a-z-]+\.webp/, `${slug} has a specific crest`);
  }
});
