// Reuse preserved assertions. Adapt only execution version, report path and documented schema/error evolution.
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
await mkdir("reports/syzia-044", { recursive: true });
const migrations = [
  "202609260041_self_service_journeys.sql",
  "202609260042_operational_refinements.sql",
  "202609260044_approved_audit_corrections.sql",
];
for (const round of ["040", "041", "042"]) {
  let s = await readFile(`tests/syzia-${round}-sql.test.mjs`, "utf8");
  const anchor = "async function test(name, fn) {";
  if (!s.includes(anchor)) throw Error("Missing explicit upgrade anchor");
  s = s.replace(
    anchor,
    migrations
      .filter((m) => Number(m.slice(9, 12)) > Number(round))
      .map(
        (m) =>
          `await db.exec(await readFile('supabase/migrations/${m}','utf8'));`,
      )
      .join("\n") +
      "\n" +
      (process.env.SYZIA_TEAM_CURRENT === "1"
        ? "await (await import('../scripts/team-availability/fixture.mjs')).upgradeTeamFixture(db,{configure:false});\n"
        : "") +
      (process.env.SYZIA_FLEXIBLE_CURRENT === "1"
        ? "await (await import('../scripts/flexible-support/fixture.mjs')).upgradeFlexibleFixture(db);\n"
        : "") +
      (process.env.SYZIA_BILLING_CURRENT === "1" ? "await (await import('../scripts/billing-047/fixture.mjs')).upgradeBillingFixture(db);\n" : "") +
      anchor,
  );
  if (process.env.SYZIA_TEAM_CURRENT === "1") {
    // Configure only disposable operational cases, after the unchanged upgrade comparison.
    const configureAnchor = /async function test\(name, fn\) \{\r?\n  await db\.exec\("begin"\);/g;
    if ([...s.matchAll(configureAnchor)].length !== 1)
      throw Error("Missing unique team fixture configuration anchor");
    s = s.replace(configureAnchor, (matched) => matched +
      '\n  if (!name.startsWith("01 Upgrade")) await (await import("../scripts/team-availability/fixture.mjs")).configureTeamFixture(db);');
  }
  s = s.replaceAll(
    `reports/syzia-${round}/sql.json`,
    `reports/syzia-044/regression-${round}.json`,
  );
  if (round === "042") {
    // The analytics API interprets dates in the organization's timezone.
    // Keep every original assertion; select the same local day as the completed
    // appointments instead of tomorrow's UTC date around midnight UTC.
    const day = 'const today = new Date().toISOString().slice(0, 10);';
    if (s.split(day).length !== 2) throw Error("Missing unique analytics day anchor");
    s = s.replace(day,
      'const today = await scalar("select (now() at time zone timezone)::date::text from organizations where id=$1", [orgs.A]);');
  }
  if (round === "040") {
    // The preserved no-card trial cases now exercise the explicit offline legacy fixture.
    // Production card-required flow is covered by tests/billing-047 with mock_enabled=false.

    // Approved 042 specific cause remains denial, not an authorization relaxation.
    s = s.replaceAll(
      "/access_denied/",
      "/access_denied|shared_identity_requires_superadmin/",
    );
    const start = s.indexOf("async function snapshot() {"),
      end = s.indexOf("const before = await snapshot();");
    if (start < 0 || end < 0) throw Error("Missing snapshot anchor");
    s =
      s.slice(0, start) +
      `const oldColumns=(await db.query("select table_schema,table_name,column_name from information_schema.columns where table_schema in('public','private')order by 1,2,ordinal_position")).rows;
async function snapshot(){await db.exec('reset role');const out={};for(const t of tables){const cols=oldColumns.filter(c=>c.table_schema===t.schemaname&&c.table_name===t.tablename&&!(t.tablename==='billing_plans'&&['featured','featured_label'].includes(c.column_name))).map(c=>'"'+c.column_name+'"').join(',');out[t.schemaname+'.'+t.tablename]=await scalar(\`select coalesce(jsonb_agg(j order by j::text),'[]') from(select to_jsonb(x)j from(select \${cols} from \${t.schemaname}.\${t.tablename})x)q\`);}return out;}
` +
      s.slice(end);
    if (process.env.SYZIA_BILLING_CURRENT === "1") s = s.replace("const before = await snapshot();", "await db.exec(\"reset role;update private.billing_runtime set mock_enabled=true\");\nconst before = await snapshot();");
  }
  const path = `tests/current-reuse-${round}.temporary.mjs`;
  try {
    await writeFile(path, s);
    const code = await new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [path], { stdio: "inherit" });
      p.on("error", reject);
      p.on("exit", resolve);
    });
    if (code !== 0) process.exitCode = 1;
  } finally {
    await unlink(path).catch(() => {});
  }
}
// Onboarding behavior remains approved; same assertions, current fixture and separate output.
{
  const path = "tests/current-onboarding.temporary.mjs";
  try {
    let s = await readFile("tests/onboarding.test.mjs", "utf8");
    s = s
      .replace("./support/consumer-db.mjs", "./support/current-fixture.mjs")
      .replace(
        "reports/onboarding-local.json",
        "reports/syzia-044/onboarding.json",
      );
    if (process.env.SYZIA_OPTIONAL_MANUAL_CURRENT === "1") {
      // Approved 048 product policy: optional checklist items never block normal operation.
      // Keep historical files byte-identical and replace only the three obsolete expectations.
      for (const [from, to] of [
        ['assert.ok(!d.items.some((i) => i.id === "manual"));', 'assert.equal(d.items.find((i) => i.id === "manual").required, false); assert.equal(d.items.find((i) => i.id === "manual").label, "Manual da empresa — Opcional");'],
        ['assert.ok(d.items.find((i) => i.id === "manual").required);', 'assert.equal(d.items.find((i) => i.id === "manual").required, false);'],
        ['assert.ok(d.items.find((i) => i.id === "autonomy").required);', 'assert.equal(d.items.find((i) => i.id === "autonomy").required, false); assert.equal(d.items.find((i) => i.id === "human_ready").required, false);'],
      ]) {
        if (s.split(from).length !== 2) throw Error("Missing unique 048 onboarding policy anchor");
        s = s.replace(from, to);
      }
      s = s.replace('Manual, FAQ e autonomia apenas após optar pelo atendimento compartilhado', '048: Manual opcional e prontidão compartilhada separada da configuração mínima');
    }
    await writeFile(path, s);
    const code = await new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [path], { stdio: "inherit" });
      p.on("error", reject);
      p.on("exit", resolve);
    });
    if (code !== 0) process.exitCode = 1;
  } finally {
    await unlink(path).catch(() => {});
  }
}
