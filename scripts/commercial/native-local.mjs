// Optional native PostgreSQL runner. Creates an isolated ephemeral cluster; never touches Supabase.
import { mkdtemp, chown, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
const root = await mkdtemp(join(tmpdir(), "syzia-commercial-pg-"));
const data = join(root, "data"),
  bin = resolve("node_modules/@embedded-postgres/linux-x64/native/bin");
const identity = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
if (identity.uid) {
  try {
    await chown(root, identity.uid, identity.gid);
  } catch (e) {
    await rm(root, { recursive: true, force: true });
    console.error(
      "Native PostgreSQL could not run: this container cannot map a non-root uid. Run this optional test as a regular Linux user. No concurrency test was executed.",
    );
    process.exit(2);
  }
}
function run(name, args) {
  const p = spawnSync(join(bin, name), args, { ...identity, encoding: "utf8" });
  if (p.status !== 0) throw new Error(`${name}: ${p.stderr || p.stdout}`);
  return p;
}
let started = false;
try {
  run("initdb", [
    "-D",
    data,
    "-U",
    "postgres",
    "--auth-local=trust",
    "--auth-host=reject",
    "--encoding=UTF8",
    "--locale=C",
  ]);
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    join(root, "postgres.log"),
    "-o",
    `-k ${root} -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  started = true;
  const client = new pg.Client({
    host: root,
    user: "postgres",
    database: "postgres",
  });
  await client.connect();
  await client.query("create database syzia_commercial_isolated");
  await client.end();
  const test = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      "tests/commercial-implementation/demos.test.mjs",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, SYZIA_COMMERCIAL_NATIVE_SOCKET: root },
    },
  );
  process.exitCode = test.status ?? 1;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  await rm(root, { recursive: true, force: true });
}
