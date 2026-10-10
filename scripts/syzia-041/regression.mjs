import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
const added = [
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
  "service_code",
  "routing_scope",
  "routing_reason",
  "subtotal_cents",
  "discount_cents",
  "source_kind",
  "source_code",
  "public_note",
];
// service_code existed in quote_requests: do not remove it from baseline snapshots.
const safeAdded = added.filter((k) => k !== "service_code");
for (const round of ["038", "039", "040"]) {
  let s = await readFile(`tests/syzia-${round}-sql.test.mjs`, "utf8");
  const anchor =
    round === "038"
      ? "await db.exec(await readFile('supabase/migrations/202609250038_multiservice_requests.sql','utf8'));"
      : round === "039"
        ? "const base = {"
        : "async function test(name, fn) {";
  if (!s.includes(anchor))
    throw Error("Missing regression upgrade anchor " + round);
  const chain =
    (round === "038"
      ? "await db.exec(await readFile('supabase/migrations/202609250039_commercial_plans.sql','utf8'));\n"
      : "") +
    (round !== "040"
      ? "await db.exec(await readFile('supabase/migrations/202609260040_post_homologation.sql','utf8'));\n"
      : "") +
    "await db.exec(await readFile('supabase/migrations/202609260041_self_service_journeys.sql','utf8'));\n";
  s = s
    .replace(anchor, round === "038" ? anchor + "\n" + chain : chain + anchor)
    .replaceAll(
      `reports/syzia-${round}/sql.json`,
      `reports/syzia-041/regression-${round}.json`,
    );
  if (round === "039")
    s = s.replace(
      "jsonb_agg(to_jsonb(t)order by id)from billing_plans",
      "jsonb_agg(to_jsonb(t)-'featured'-'featured_label'order by id)from billing_plans",
    );
  for (const alias of ["q", "i", "x"])
    s = s.replaceAll(
      `to_jsonb(${alias})`,
      `to_jsonb(${alias})` + safeAdded.map((k) => `-'${k}'`).join(""),
    );
  if (round === "040")
    s = s.replace(
      "select to_jsonb(x)",
      "select to_jsonb(x)-case when '${t.tablename}'='attachments'then 'service_code'else '_nonexistent_'end",
    );
  if (round === "038") {
    const start = s.indexOf("await test('Central recebe todos os itens"),
      end = s.indexOf("await test('Seleção original", start);
    if (start < 0 || end < 0) throw Error("Missing 038 routing case");
    // 041 intentionally routes review combinations to the company, preserving this version/conversation test with an authorized company actor.
    s =
      s.slice(0, start) +
      s
        .slice(start, end)
        .replace(
          "await as('agentA');",
          "await as('adminA');await rpc('central_presence',{p_state:'available'});",
        ) +
      s.slice(end);
  }
  const path = `tests/syzia-041-regression-${round}-temporary.test.mjs`;
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
