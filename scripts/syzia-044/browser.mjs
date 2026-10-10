import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
const files = [];
try {
  for (const source of [
    "syzia-042",
    "syzia-040",
    "syzia-033-media",
    "syzia-034-media",
    "syzia-036",
  ]) {
    let s = await readFile(`tests/demo-browser/${source}.spec.ts`, "utf8");
    if (source === "syzia-040") {
      const first = s.indexOf('test("05 Proposta aprovada:'),
        last = s.indexOf('test("06 FAQ:');
      if (first < 0 || last < 0)
        throw Error("Missing approved replacement anchors");
      s = s.slice(0, first) + s.slice(last);
    }
    if (source === "syzia-036") {
      if (!s.includes("for (const company of [false, true])"))
        throw Error("Missing explicit company selection anchor");
      s = s.replace(
        "for (const company of [false, true])",
        "for (const company of [true])",
      );
    }
    // Isolate fixture titles shared by independently authored media suites.
    if (source === 'syzia-034-media') s = s.replaceAll('Trabalho fictício ', 'Trabalho 034 fictício ');
    s = s.replace(
      /reports\/syzia-\d+\//g,
      `reports/syzia-044/reused-${source}/`,
    );
    const tmp = `tests/demo-browser/current-${source}.temporary.spec.ts`;
    files.push(tmp);
    await writeFile(tmp, s);
  }
  process.exitCode = await new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config=playwright.current.config.ts",
        ...process.argv.slice(2),
      ],
      { stdio: "inherit" },
    );
    p.on("error", reject);
    p.on("exit", (c) => resolve(c ?? 1));
  });
} finally {
  for (const file of files) await unlink(file).catch(() => {});
}
