import { consumerDB } from "../../tests/support/consumer-db.mjs";
try {
  const c = await consumerDB();
  console.log("042 migration applied");
  await c.db.close();
} catch (e) {
  console.error(
    e.message,
    e.where,
    e.detail,
    e.position,
    e.query?.slice(
      Math.max(0, Number(e.position) - 160),
      Number(e.position) + 160,
    ),
  );
  process.exitCode = 1;
}
