// Execute the four historical legal cases unchanged on the current fixture.
// Never edit historical tests to repair their old migration-loading entry point.
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const name of ["SYZIA_TEAM_CURRENT", "SYZIA_FLEXIBLE_CURRENT", "SYZIA_BILLING_CURRENT", "SYZIA_OPTIONAL_MANUAL_CURRENT", "SYZIA_OPERATION_CURRENT"]) process.env[name] = "1";
const source = await readFile("tests/enterprise-access.test.mjs", "utf8");
const start = source.indexOf('await test("Termos e Privacidade públicos sem dados privados"');
const end = source.indexOf('await test("Convite legado não pode mais ativar nem enviar"');
const helperEnd = source.indexOf('await test("Super Admin legado mantém acesso e contexto"');
if (start < 0 || end <= start || helperEnd < 0) throw Error("legal_regression_anchors_changed");
const cases = source.slice(start, end);
if ((cases.match(/await test\(/g) || []).length !== 4) throw Error("legal_regression_cases_changed");
let body = source.slice(0, helperEnd).replace('"./support/consumer-db.mjs"', '"./support/current-fixture.mjs"') + cases;
body += '\nawait writeFile("reports/hotfix-050/legal-contract.json", JSON.stringify(results,null,2));\nawait db.close();\nif(results.some(r=>r.status!=="PASS")) process.exitCode=1;\n';
await mkdir("reports/hotfix-050", { recursive: true });
const path = "tests/current-legal-050.temporary.mjs";
try {
  await writeFile(path, body);
  const r = spawnSync(process.execPath, [path], { stdio: "inherit", env: process.env });
  process.exitCode = r.status ?? 1;
} finally { await unlink(path); }
