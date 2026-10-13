import { spawn } from "node:child_process";
import { mkdir as mk, writeFile as write } from "node:fs/promises";
import { createWriteStream } from "node:fs";
process.env.BUNDLE_REPORT_PREFIX = "reports/syzia-044/bundle";
process.env.SYZIA_TEAM_CURRENT = "1";
process.env.SYZIA_FLEXIBLE_CURRENT = "1";
process.env.SYZIA_BILLING_CURRENT = "1";
process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
process.env.SYZIA_OPERATION_CURRENT = "1";
const controlled = process.argv.includes("--inject-failure");
if (!controlled) await (await import("../billing-047/browser-runtime.mjs")).prepareGateBrowser();
const out = "reports/syzia-044";
await mk(out, { recursive: true });
await mk("reports/team-availability", { recursive: true });
const node = process.execPath;
export const suites = [
 ["legal-versioning-050",[node,"--test","--test-concurrency=1","tests/legal-050/versioning.test.mjs","tests/legal-050/tooling.test.mjs"]],
 ["legal-historical-050",[node,"scripts/hotfix-050/legal-regression.mjs"]],
 ["hotfix-050", [node,"--experimental-strip-types","--test","--test-concurrency=1","tests/hotfix-050/notifications.test.mjs","tests/hotfix-050/integrity.test.mjs"]],
 ["hotfix-049", [node,"--experimental-strip-types","--test","--test-concurrency=1","tests/hotfix-049/operation.test.mjs","tests/hotfix-049/messages.test.mjs","tests/hotfix-049/integrity.test.mjs"]],
 ["focused-049", [node,"--experimental-strip-types","--test","--test-concurrency=1","tests/syzia-049/financial.test.mjs","tests/syzia-049/http.test.mjs","tests/syzia-049/operation.test.mjs","tests/syzia-049/ui-utils.test.mjs","tests/syzia-049/integrity.test.mjs","tests/syzia-049/upgrade.test.mjs"]],
  ["focused-048", [node, "--test", "--test-concurrency=1", "tests/syzia-048/unified.test.mjs", "tests/syzia-048/manual.test.mjs", "tests/syzia-048/integrity.test.mjs"]],
  ["billing-047", [node, "--test", "--test-concurrency=1", "tests/billing-047/edge-cases.test.mjs", "tests/billing-047/gateway.test.mjs", "tests/billing-047/lifecycle.test.mjs", "tests/billing-047/subscriptions.test.mjs", "tests/billing-047/upgrade.test.mjs", "tests/billing-047/mp01.test.mjs"]],
  ["gate-contracts", [node, "--test", "tests/current-gate.test.mjs"]],
  ["flexible-upgrade", [node, "tests/flexible-support-upgrade.test.mjs"]],
  ["flexible-support", [node, "scripts/billing-047/flexible-regression.mjs"]],
  ["team-upgrade", [node, "tests/team-availability-upgrade.test.mjs"]],
  ["team-availability", [node, "tests/team-availability.test.mjs"]],
  ["ux001-security", [node, "tests/ux001-security.test.mjs"]],
  ["focused", [node, "tests/syzia-044-sql.test.mjs"]],
  ["upgrade", [node, "tests/syzia-044-upgrade.test.mjs"]],
  ["regression-040-042", [node, "scripts/syzia-044/regression.mjs"]],
  [
    "gateways",
    [
      node,
      "--experimental-strip-types",
      "--test",
      "tests/syzia-036-http.test.mjs",
      "tests/syzia-035-server.test.mjs",
      "tests/enterprise-access-server.test.mjs",
      "tests/organization-activation-server.test.mjs",
      "tests/syzia-034-utils.test.mjs",
      "tests/syzia-media.test.mjs",
    ],
  ],
  ["build", [node, "scripts/inspect-browser-bundle.mjs"]],
  ["browser", [node, "scripts/syzia-044/browser.mjs"]],
  [
    "team-browser",
    [
      node,
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=playwright.team-availability.config.ts",
    ],
  ],
  [
    "ux001-browser",
    [
      node,
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=playwright.ux001.config.ts",
    ],
  ],
  ["browser-hotfix-049", [node, "node_modules/@playwright/test/cli.js", "test", "--config=playwright.hotfix049.config.ts"]],
  ["browser-049", [node, "node_modules/@playwright/test/cli.js", "test", "--config=playwright.syzia049.config.ts"]],
  ["browser-048", [node, "node_modules/@playwright/test/cli.js", "test", "--config=playwright.syzia048.config.ts"]],
  ["billing-browser", [node, "node_modules/@playwright/test/cli.js", "test", "--config=playwright.billing047.config.ts"]],
  ["flexible-browser", [node, "node_modules/@playwright/test/cli.js", "test", "--config=playwright.flexible-support.config.ts"]],
  ["browser-legal-050",[node,"node_modules/@playwright/test/cli.js","test","--config=playwright.legal050.config.ts"]],
  ["browser-hotfix-050", [node, "node_modules/@playwright/test/cli.js", "test", "--config=playwright.hotfix050.config.ts"]],
];
const steps = controlled
  ? [["controlled-failure", [node, "-e", "process.exit(42)"]]]
  : suites;
const report = {
  version: "050",
  engine:
    "Local PGlite + HTTP fixtures + Chromium; external homologation pending",
  startedAt: new Date().toISOString(),
  node: process.version,
  controlledFailure: controlled,
  status: "RUNNING",
  steps: [],
};
for (const [name, command] of steps) {
  const start = Date.now(),
    log = `${out}/gate-${name}.log`;
  console.log("RUN", name);
  const file = createWriteStream(log);
  const exitCode = await new Promise((resolve) => {
    const p = spawn(command[0], command.slice(1), {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout.pipe(file, { end: false });
    p.stderr.pipe(file, { end: false });
    p.on("error", (e) => {
      file.write(e.message);
      resolve(1);
    });
    p.on("close", (code) => resolve(code ?? 1));
  });
  await new Promise((resolve) => file.end(resolve));
  report.steps.push({
    name,
    command,
    exitCode,
    status: exitCode === 0 ? "PASS" : "FAIL",
    durationMs: Date.now() - start,
    log,
  });
  console.log(exitCode === 0 ? "PASS" : "FAIL", name);
  if (exitCode !== 0) break;
}
report.finishedAt = new Date().toISOString();
report.status =
  report.steps.length === steps.length &&
  report.steps.every((s) => s.status === "PASS")
    ? "PASS"
    : "FAIL";
report.notRun = steps.slice(report.steps.length).map((s) => s[0]);
await write(
  `${out}/${controlled ? "gate-controlled-failure" : "current-gate"}.json`,
  JSON.stringify(report, null, 2),
);
if (report.status !== "PASS") process.exitCode = 1;
