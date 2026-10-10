// Disposable local 035 schema (001–033). Never connects to the owner's project.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "../../tests/support/consumer-db.mjs";
import { digest } from "../../server/enterprise-access.mjs";
if (process.env.FOUNDATION_NATIVE_SOCKET)
  throw Error("This diagnosis requires the disposable PGlite fixture.");
const c = await consumerDB({
    through: "202609240033_acquisition_selfservice_finance.sql",
  }),
  results = [];
try {
  await c.db.exec("begin");
  await c.as("root");
  const a = await c.rpc("people_reserve", {
    p_display: "Diagnóstico Fictício",
    p_username: "diagnostico.035",
    p_email: "diagnostico035@example.invalid",
    p_phone: "",
    p_role: "person",
    p_key: randomUUID(),
  });
  await c.db.exec("commit;reset role");
  await c.db.query(
    "insert into auth.users(id,email,email_confirmed_at,is_anonymous)values($1,'diagnostico035@auth.invalid',now(),false)",
    [a.user_id],
  );
  await c.db.exec("begin;set local role service_role");
  await c.rpc("access_finish_provision", {
    p_id: a.id,
    p_actor: users.root,
    p_hash: digest("FICTITIOUS035"),
  });
  for (const [scenario, context, username] of [
    ["correto", "SYZIA", "diagnostico.035"],
    ["contexto diferente", "OUTRO", "diagnostico.035"],
    ["username diferente", "SYZIA", "outra.pessoa"],
    ["campos perdidos após recarga", "", ""],
  ]) {
    const r = await c.rpc("access_verify_code", {
      p_code: context,
      p_username: username,
      p_hash: digest("FICTITIOUS035"),
      p_proof: digest(randomUUID()),
    });
    results.push({ scenario, accepted: Boolean(r) });
  }
  await c.db.exec("commit;reset role");
  const report = {
    request_ids: [
      "7d1af94c-639e-40a5-9591-0693e3a4c6d9",
      "29e82904-c6b9-4c6e-ac0a-9eaa0cbf755f",
    ],
    historical_cause: "Não determinável somente pelos logs fornecidos",
    environment: "PGlite local, RPCs da base 035; sem Supabase externo",
    results,
  };
  await writeFile(
    "reports/syzia-036/diagnostico-035.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await c.db.close();
}
