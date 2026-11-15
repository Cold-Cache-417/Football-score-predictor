import assert from "node:assert/strict";
import test from "node:test";

import { handler } from "../server/app.mjs";
import { getProviderLog } from "../server/lib/providers/log.mjs";

const get = (pathname) => handler(new Request(`http://local${pathname}`));

test("competition routes are gated by the flag and add no provider calls", async () => {
  /* ---- flag off: today's behaviour, byte for byte ---- */
  delete process.env.COMPETITIONS;
  const offRoutes = await get("/api/competitions");
  assert.equal(offRoutes.status, 404);
  assert.deepEqual(await offRoutes.json(), { error: "Unknown endpoint" });

  const plain = await get("/api/fixtures");
  const ignored = await get("/api/fixtures?competition=epl");
  assert.equal(plain.status, 200);
  assert.equal(ignored.status, 200);
  assert.equal(await ignored.text(), await plain.text(), "query parameter ignored when flag is off");

  const bootOff = await (await get("/api/bootstrap.js?competition=epl")).text();
  assert.match(bootOff, /La Liga/);

  /* ---- flag on ---- */
  process.env.COMPETITIONS = "on";
  const before = getProviderLog().length;
  const list = await (await get("/api/competitions")).json();
  assert.deepEqual(list.competitions.map((c) => c.id), ["laliga", "epl"]);

  const unknown = await get("/api/fixtures?competition=seriea");
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, "UNKNOWN_COMPETITION");

  const epl = await get("/api/fixtures?competition=epl");
  assert.equal(epl.status, 200);
  const eplBody = await epl.json();
  assert.equal(eplBody.meta.competition.id, "epl");
  assert.equal(eplBody.meta.league, "Premier League");
  assert.ok(Array.isArray(eplBody.meta.providers));
  assert.equal(getProviderLog().length, before, "no provider request at request time");

  const bootOn = await (await get("/api/bootstrap.js?competition=epl")).text();
  assert.match(bootOn, /Premier League/);
  assert.match(bootOn, /CALIBRA_BOOTSTRAP/);

  const laliga = await (await get("/api/fixtures")).json();
  assert.equal(laliga.meta.competition, undefined);
  assert.ok(!laliga.fixtures.some((f) => String(f.id).startsWith("p-epl-")));
});
