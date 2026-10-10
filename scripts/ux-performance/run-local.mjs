import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  createWriteStream,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
const log = createWriteStream("reports/ux-performance/server.log");
const procs = [];
function start(args) {
  const p = spawn(process.execPath, args, {
    env: { ...process.env, DEMO_TEST_MODE: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.pipe(log, { end: false });
  p.stderr.pipe(log, { end: false });
  procs.push(p);
  return p;
}
async function ready(url) {
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("Server not ready " + url);
}
const temp = `scripts/.audit-demo-${randomUUID()}.mjs`;
writeFileSync(
  temp,
  readFileSync("scripts/dev-consumer-demo.mjs", "utf8").replace(
    '"node_modules/vite/bin/vite.js",',
    '"node_modules/vite/bin/vite.js", "preview", "--outDir", process.env.AUDIT_DIST || "dist",',
  ),
);
try {
  start([temp]);
  await ready("http://127.0.0.1:5173/");
  const p = spawn(
    process.execPath,
    [
      process.argv[2] || "scripts/ux-performance/measure.mjs",
      ...process.argv.slice(3),
    ],
    { stdio: "inherit", env: process.env },
  );
  process.exitCode = await new Promise((r) =>
    p.on("exit", (code) => r(code ?? 1)),
  );
} finally {
  for (const p of procs) p.kill("SIGTERM");
  log.end();
  unlinkSync(temp);
}
