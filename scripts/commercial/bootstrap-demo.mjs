import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export async function bootstrapDemo(db) {
  const exists = (
    await db.query(
      "select exists(select 1 from pg_namespace where nspname in('auth','private','demo_private')) present",
    )
  ).rows[0].present;
  if (exists) throw Error("demo_requires_empty_database");
  await db.exec(
    await readFile("server/commercial/bootstrap-schema.sql", "utf8"),
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  await db.exec(await readFile("server/commercial/demo-schema.sql", "utf8"));
  await db.exec(await readFile("server/commercial/demo-upgrade-055.sql", "utf8"));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    !process.argv.includes("--initialize-empty-demo-database") ||
    process.env.DEMO_DATABASE_PURPOSE !== "syzia-commercial-demo-054"
  )
    throw Error("explicit_demo_initialization_required");
  const u = new URL(process.env.DEMO_DATABASE_URL || "");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
    !process.argv.includes("--owner-authorized-demo-only")
  )
    throw Error("local_database_required");
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: u.href });
  await c.connect();
  try {
    await bootstrapDemo({
      query: (...a) => c.query(...a),
      exec: (s) => c.query(s),
    });
    console.log(
      "Dedicated demonstration schema initialized. No operational database was used.",
    );
  } finally {
    await c.end();
  }
}
