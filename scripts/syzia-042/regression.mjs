import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
for (const round of ["040", "041"]) {
  let s = await readFile(`tests/syzia-${round}-sql.test.mjs`, "utf8");
  const anchor = "async function test(name, fn) {";
  const chain =
    (round === "040"
      ? "await db.exec(await readFile('supabase/migrations/202609260041_self_service_journeys.sql','utf8'));\n"
      : "") +
    "await db.exec(await readFile('supabase/migrations/202609260042_operational_refinements.sql','utf8'));\n";
  if (!s.includes(anchor)) throw Error("Missing upgrade anchor");
  s = s
    .replace(anchor, chain + anchor)
    .replaceAll(
      `reports/syzia-${round}/sql.json`,
      `reports/syzia-042/regression-${round}.json`,
    );
  if (round === "040") {
    s = s.replaceAll(
      "/access_denied/",
      "/access_denied|shared_identity_requires_superadmin/",
    );
    const added = [
      "execution_mode",
      "execution_max_periods",
      "price_max_cents",
      "execution_group",
      "part_number",
      "service_minutes",
      "desired_periods",
      "contract_mode",
      "photo_policy",
      "photo_instructions",
      "instruction",
      "multiline",
      "condition_field",
      "condition_value",
      "journey",
      "desired_start",
      "help_only",
      "help_context",
      "photo_request",
      "photo_requested_at",
      "routing_scope",
      "routing_reason",
      "subtotal_cents",
      "discount_cents",
      "source_kind",
      "source_code",
      "public_note",
    ];
    s = s.replace(
      "select to_jsonb(x)",
      "select to_jsonb(x)-case when '${t.tablename}'='attachments'then 'service_code'else '_nonexistent_'end" +
        added.map((k) => `-'${k}'`).join(""),
    );
  }
  const path = `tests/syzia-042-regression-${round}-temporary.test.mjs`;
  try {
    await writeFile(path, s);
    const code = await new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [path], { stdio: "inherit" });
      p.on("error", reject);
      p.on("exit", resolve);
    });
    if (code) process.exitCode = 1;
  } finally {
    await unlink(path).catch(() => {});
  }
}
