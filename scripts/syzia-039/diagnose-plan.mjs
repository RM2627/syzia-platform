import { consumerDB } from "../../tests/support/consumer-db.mjs";
const c = await consumerDB();
await c.db.exec("begin");
// Disposable database only: surface the SQL cause of any swallowed diagnostic error.
const fn = await c.scalar(
  "select pg_get_functiondef('public.billing_plan_test(jsonb)'::regprocedure)",
);
await c.db.exec(
  fn
    .replaceAll(
      "'A verificação foi interrompida e descartada. Revise os campos ou consulte o relatório técnico.'",
      "sqlstate||': '||sqlerrm",
    )
    .replaceAll(
      "'A operação não concluiu a verificação.'",
      "sqlstate||': '||sqlerrm",
    ),
);
await c.as("root");
console.log(
  JSON.stringify(
    await c.rpc("billing_plan_test", {
      p_data: {
        name: "Teste 039",
        price_cents: 12000,
        interval_months: 1,
        member_limit: 3,
        capabilities: {
          software: true,
          finance: false,
          analytics: true,
          human_support: false,
          commercial_followups: true,
        },
      },
    }),
    null,
    2,
  ),
);
await c.db.exec("rollback");
await c.db.close();
