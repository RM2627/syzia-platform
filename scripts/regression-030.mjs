import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
const groups = [
  [
    "consumer",
    "presence-payments",
    "central",
    "commercial",
    "analytics",
    "billing",
    "trial",
    "onboarding",
    "operations",
    "company-page",
    "multisegment",
  ],
  [
    "master",
    "workspace",
    "activation",
    "access",
    "company",
    "security",
    "config",
    "homologation-tools",
    "company-tools",
    "consumer-tools",
    "central-tools",
    "commercial-tools",
    "billing-tools",
    "analytics-tools",
    "images",
    "billing-provider",
    "vireloq",
    "trial-upgrade",
    "billing-upgrade",
    "analytics-upgrade",
    "commercial-upgrade",
  ],
];
const results = [];
await Promise.all(
  groups.map(async (g) => {
    for (const name of g) {
      const log = createWriteStream(
        "reports/implementation-030/regression-" + name + ".log",
      );
      const start = Date.now();
      const code = await new Promise((resolve) => {
        const p = spawn(
          "npm",
          ["run", name === "security" ? "test" : "test:" + name],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        p.stdout.pipe(log, { end: false });
        p.stderr.pipe(log, { end: false });
        p.on("close", resolve);
      });
      log.end();
      results.push({ name, code, seconds: (Date.now() - start) / 1000 });
      console.log(code === 0 ? "PASS" : "FAIL", name);
    }
  }),
);
await writeFile(
  "reports/implementation-030/regression.json",
  JSON.stringify(results, null, 2),
);
if (results.length !== groups.flat().length)
  throw new Error("Incomplete regression run");
if (results.some((r) => r.code !== 0)) process.exitCode = 1;
