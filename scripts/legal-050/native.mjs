// Isolated Unix-socket PostgreSQL. Does not read PGHOST, DATABASE_URL or Supabase config.
import { mkdtemp, chown, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
const root = await mkdtemp(join(tmpdir(), "syzia-legal050-"));
const bin = resolve("node_modules/@embedded-postgres/linux-x64/native/bin"),
  data = join(root, "data");
const identity = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
let started = false,
  report = {
    status: "RUNNING",
    scope: "isolated native PostgreSQL",
    executed: false,
  };
function run(name, args) {
  const p = spawnSync(join(bin, name), args, { ...identity, encoding: "utf8" });
  if (p.status !== 0) throw Error(name + " failed");
}
try {
  if (identity.uid) await chown(root, identity.uid, identity.gid);
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
  const c = new pg.Client({
    host: root,
    user: "postgres",
    database: "postgres",
  });
  await c.connect();
  await c.query("create database foundation_phase2_test");
  await c.end();
  const r = spawnSync(process.execPath, ["tests/legal-050/concurrency.mjs"], {
    stdio: "inherit",
    env: { ...process.env, FOUNDATION_NATIVE_SOCKET: root },
  });
  report = {
    ...report,
    status: r.status === 0 ? "PASS" : "FAIL",
    executed: true,
    exit_code: r.status,
  };
  process.exitCode = r.status ?? 1;
} catch (e) {
  report = { ...report, status: "BLOCKED", reason: e.code || e.message };
  console.error(
    "Native local PostgreSQL unavailable; no concurrent sessions were tested.",
  );
  process.exitCode = 2;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  await rm(root, { recursive: true, force: true });
  await mkdir("reports/legal-050", { recursive: true });
  await writeFile(
    "reports/legal-050/native.json",
    JSON.stringify(report, null, 2),
  );
}
