// Exclusive disposable local demo. Historical appointments are fixture data, never imported customers.
import { randomUUID } from "node:crypto";
import { users } from "../support/consumer-db.mjs";
export async function seedOperationsDemo(c) {
  const { db, as, rpc, scalar, orgs } = c;
  if (db.constructor.name !== "PGlite")
    throw Error("local_pglite_fixture_required");
  await db.exec("begin");
  try {
    await as("adminA");
    await rpc("operations_set_attendant", {
      p_org: orgs.A,
      p_user: users.worker,
      p_enabled: true,
    });
    await rpc("operations_support_mode", {
      p_org: orgs.A,
      p_mode: "mixed",
      p_revision: await scalar(
        "select revision from company_settings where organization_id=$1",
        [orgs.A],
      ),
    });
    await scalar("select company_set_activation($1,$2,true,true)", [
      orgs.A,
      await scalar(
        "select revision from company_settings where organization_id=$1",
        [orgs.A],
      ),
    ]);
    const d = await rpc("operations_directory", {
        p_org: orgs.A,
        p_search: "",
        p_offset: 0,
      }),
      s = d.catalog.services.find((s) => s.price_mode === "fixed");
    for (const [index, name, offset, hour, state] of [
      [0, "Marina • Fictícia", 0, 8, "completed"],
      [1, "Rafael • Fictício", 0, 10, "in_progress"],
      [2, "Bianca • Fictícia", 0, 14, "scheduled"],
      [3, "André • Fictício", 1, 9, "scheduled"],
      [4, "Clara • Fictícia", 1, 14, "scheduled"],
    ]) {
      await as("adminA");
      const customer = await rpc("operations_customer", {
        p_org: orgs.A,
        p_data: {
          name,
          whatsapp: "8199999010" + index,
          accepted_notice: true,
          contact: true,
        },
        p_key: randomUUID(),
      });
      const q = await rpc("operations_request", {
        p_org: orgs.A,
        p_customer: customer,
        p_service: s.code,
        p_addons: [],
        p_answers: Object.fromEntries(
          s.questions.map((q) => [q.code, "Veículo de demonstração"]),
        ),
        p_notes: "Cenário fictício para demonstrar a rotina da empresa.",
        p_source: index % 2 ? "whatsapp" : "referral",
        p_key: randomUUID(),
      });
      await db.exec("reset role");
      const a = await scalar(
        "insert into appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at,note) select $1,id,'booking',$2,$3,(((now() at time zone 'America/Recife')::date+$4::int)+make_time($5::int,0,0)) at time zone 'America/Recife',(((now() at time zone 'America/Recife')::date+$4::int)+make_time($5::int+1,0,0)) at time zone 'America/Recife','Horário fictício de demonstração' from schedule_resources where organization_id=$1 returning id",
        [orgs.A, q.id, customer, offset, hour],
      );
      if (state !== "scheduled")
        await db.query(
          "update appointments set execution_state='in_progress',started_at=starts_at where id=$1",
          [a],
        );
      if (state === "completed")
        await db.query(
          "update appointments set execution_state='completed',completed_at=ends_at where id=$1",
          [a],
        );
    }
    await as("worker");
    await scalar("select foundation_update_profile($1)", [
      "Pat • Equipe própria fictícia",
    ]);
    await rpc("central_presence", { p_state: "available" });
    await db.exec("reset role");
    users.newadmin = "10000000-0000-0000-0000-000000000012";
    await db.query(
      "insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,now(),false)",
      [users.newadmin],
    );
    await as("root");
    const newOrg = await scalar(
      "select foundation_create_organization($1,$2,$3)",
      ["Ateliê Inicial • Fictício", "atelie-inicial-ficticio", users.newadmin],
    );
    await as("newadmin");
    await scalar("select company_initialize($1)", [newOrg]);
    await db.exec("commit;reset role");
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
