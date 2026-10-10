import { readFile, writeFile, unlink } from "node:fs/promises";
const path = new URL("../../tests/flexible-support.047-temporary.mjs", import.meta.url);
try {
  const source = await readFile("tests/flexible-support.test.mjs", "utf8");
  if (!source.includes("await upgrade();")) throw Error("Missing 046 upgrade anchor");
  await writeFile(path, source.replace("await upgrade();", "await upgrade();\nawait (await import('../scripts/billing-047/fixture.mjs')).upgradeBillingFixture(db);"));
  await import(path.href);
} finally { await unlink(path).catch(() => {}); }
