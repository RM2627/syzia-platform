import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
// Reuse the preserved 038 acceptance suite on a populated 036 -> 038 -> 039
// database. Historical reports and original tests are never overwritten.
const source = await readFile("tests/syzia-038-sql.test.mjs", "utf8");
const anchor =
  "await db.exec(await readFile('supabase/migrations/202609250038_multiservice_requests.sql','utf8'));";
if (!source.includes(anchor)) throw Error("038 upgrade anchor changed");
const path = "tests/syzia-039-regression-temporary.test.mjs";
try {
  await writeFile(
    path,
    source
      .replace(
        anchor,
        anchor +
          "\nawait db.exec(await readFile('supabase/migrations/202609250039_commercial_plans.sql','utf8')); ",
      )
      .replaceAll(
        "'reports/syzia-038/sql.json'",
        "'reports/syzia-039/regression-038.json'",
      ),
  );
  process.exitCode = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path], { stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await unlink(path).catch(() => {});
}
