import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { consumerDB } from "./support/consumer-db.mjs";
import { seedCentral } from "./fixtures/central.mjs";
const c = await consumerDB({ through: "202609160013_central_integration.sql" }),
  f = await seedCentral(c);
let result;
try {
  await c.db.exec("begin");
  await c.as("alice");
  const page = await c.rpc("consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    }),
    s = page.services.find((s) => s.price_mode === "fixed"),
    slots = await c.rpc("consumer_slots", {
      p_slug: page.slug,
      p_service: s.code,
      p_addons: [],
      p_day: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    });
  await c.rpc("consumer_book", {
    p_code: f.requests.A,
    p_start: slots[0],
    p_previous: null,
    p_key: randomUUID(),
  });
  await c.db.exec("commit;reset role");
  const before = await c.db.query("select * from opportunities order by id"),
    events = await c.scalar("select count(*) from request_events");
  for (const path of (await readdir("supabase/migrations"))
    .filter((p) => p > "202609160013_central_integration.sql")
    .sort())
    await c.db.exec(await readFile("supabase/migrations/" + path, "utf8"));
  assert.deepEqual(
    (await c.db.query("select * from opportunities order by id")).rows,
    before.rows,
  );
  assert.equal(await c.scalar("select count(*) from request_events"), events);
  assert.equal(
    await c.scalar(
      "select count(*)::int from commercial_opportunity_state where commercial_state='converted' and commercial_conversion_event is not null",
    ),
    1,
  );
  assert.equal(
    await c.scalar("select count(*)::int from commercial_events"),
    0,
  );
  assert.equal(await c.scalar("select count(*)::int from commercial_tasks"), 0);
  result = {
    name: "Upgrade 013→016 preserva registros, reconhece agendamento real e não fabrica histórico/tarefas",
    status: "PASS",
  };
} catch (e) {
  result = {
    name: "Upgrade cumulativo com dados fictícios anteriores",
    status: "FAIL",
    error: e.message,
  };
  process.exitCode = 1;
} finally {
  await c.db.close();
}
await writeFile(
  "reports/commercial-upgrade-results.json",
  JSON.stringify(
    {
      environment: "LOCAL PGlite; fixture na Fase 5 antes das migrations novas",
      tests: [result],
    },
    null,
    2,
  ),
);
console.log(
  result.status + " " + result.name + (result.error ? ": " + result.error : ""),
);
