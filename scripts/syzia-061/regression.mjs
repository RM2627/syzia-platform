// Diagnostic continuation of every unchanged historical gate command. No suite is
// skipped or downgraded. Unlike the official fail-fast runner, collect all failures.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { runInNewContext } from "node:vm";
import { prepareGateBrowser } from "../billing-047/browser-runtime.mjs";
await prepareGateBrowser();
for (const key of [
  "SYZIA_TEAM_CURRENT",
  "SYZIA_FLEXIBLE_CURRENT",
  "SYZIA_BILLING_CURRENT",
  "SYZIA_OPTIONAL_MANUAL_CURRENT",
  "SYZIA_OPERATION_CURRENT",
])
  process.env[key] = "1";
process.env.BUNDLE_REPORT_PREFIX = "reports/syzia-044/bundle";
const output =
  process.env.SYZIA061_REGRESSION_DIR || "/tmp/syzia061-regression";
await mkdir(output, { recursive: true });
for (const d of ["reports/syzia-044", "reports/team-availability"])
  await mkdir(d, { recursive: true });
const source = await readFile("scripts/syzia-044/current-gate.mjs", "utf8");
const array = source
  .slice(
    source.indexOf("export const suites = ") + 22,
    source.indexOf("\nconst steps ="),
  )
  .trim()
  .replace(/;$/, "");
const suites = runInNewContext(
  array,
  { node: process.execPath },
  { timeout: 1000 },
);
if (!Array.isArray(suites) || suites.length < 30)
  throw Error("historical_gate_contract_changed");
const resume = process.argv.includes("--resume");
const results = resume
  ? JSON.parse(await readFile(output + "/results.json", "utf8")).results
  : [];
for (const [name, command] of suites.slice(results.length)) {
  console.log("RUN", name);
  const start = Date.now(),
    stream = createWriteStream(output + "/" + name + ".log");
  const code = await new Promise((resolve) => {
    const p = spawn(command[0], command.slice(1), {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      stream.write(
        "\nDIAGNOSTIC LIMIT: suite did not complete within 300 seconds.\n",
      );
      try {
        process.kill(process.platform === "win32" ? p.pid : -p.pid, "SIGTERM");
      } catch {}
    }, 300000);
    p.stdout.pipe(stream, { end: false });
    p.stderr.pipe(stream, { end: false });
    p.once("error", () => resolve(1));
    p.once("close", (c) => {
      clearTimeout(timer);
      resolve(c ?? 1);
    });
  });
  await new Promise((r) => stream.end(r));
  results.push({
    name,
    command,
    status: code === 0 ? "PASS" : "FAIL",
    exitCode: code,
    durationMs: Date.now() - start,
  });
  console.log(results.at(-1).status, name);
  await writeFile(
    output + "/results.json",
    JSON.stringify(
      {
        status: results.some((r) => r.status === "FAIL") ? "FAIL" : "RUNNING",
        total: suites.length,
        completed: results.length,
        results,
      },
      null,
      2,
    ),
  );
}
const status = results.every((r) => r.status === "PASS") ? "PASS" : "FAIL";
await writeFile(
  output + "/results.json",
  JSON.stringify(
    { status, total: suites.length, completed: results.length, results },
    null,
    2,
  ),
);
if (status !== "PASS") process.exitCode = 1;
