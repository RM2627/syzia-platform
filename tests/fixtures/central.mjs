import { randomUUID } from "node:crypto";
import { users } from "../support/consumer-db.mjs";
export async function seedCentral(
  c,
  { tickets = true, commercial = false, supportPlan = true } = {},
) {
  const { db, as, scalar, rpc, orgs, save } = c;
  await db.exec("begin");
  await as("root");
  for (const u of ["agentA", "backup", "agentB", "shared"])
    await scalar("select foundation_set_global_role($1,'atendente',true)", [
      users[u],
    ]);
  const has030=Boolean(await scalar("select to_regprocedure('public.billing_capabilities(uuid)') is not null"));
  if(has030&&supportPlan){
    const plan=await rpc('billing_plan_save',{p_id:null,p_revision:0,p_data:{name:'Capacidade compartilhada • fixture',description:'Plano exclusivamente fictício para regressão',active:true,available:false,position:99,price_cents:100,interval_months:1,trial_days:0,human_support:true,commercial_followups:true,member_limit:null,service_limit:null,request_limit:null,ticket_limit:null,followup_limit:null}});
    await db.exec('reset role');
    // The fixture represents already active contracts. No real provider or payment is used.
    for(const o of Object.values(orgs))await db.query("insert into billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)select $1,id,'active',now(),now()+interval '1 year'from billing_plan_versions where plan_id=$2 order by version desc limit 1",[o,plan]);
    await as('root');
  }
  for (const [org, u, kind] of [
    ["A", "agentA", "primary"],
    ["A", "backup", "backup"],
    ["A", "shared", "backup"],
    ["B", "agentB", "primary"],
    ["B", "shared", "backup"],
  ])
    if(!has030||supportPlan)await scalar("select foundation_set_attendant($1,$2,$3,'active')", [
      orgs[org],
      users[u],
      kind,
    ]);
  for (const [u, name] of [
    ["agentA", "Alex • Fictício"],
    ["backup", "Bia • Fictícia"],
    ["agentB", "Caio • Fictício"],
    ["shared", "Dani • Fictícia"],
  ]) {
    await as(u);
    await scalar("select foundation_update_profile($1)", [name]);
    await rpc("central_presence", { p_state: "available" });
  }
  for (const k of ["A", "B"]) {
    await as("admin" + k);
    if(has030&&!supportPlan){await rpc('operations_set_attendant',{p_org:orgs[k],p_user:users.worker,p_enabled:true});await rpc('operations_support_mode',{p_org:orgs[k],p_mode:'own',p_revision:await scalar('select revision from company_settings where organization_id=$1',[orgs[k]])});}
    await save(k, "permissions", {
      allowed_actions: [
        "price_list",
        "quote_create",
        "quote_send",
        "schedule",
        "reschedule",
        "cancel",
        "discount",
        ...(commercial ? ["follow_up"] : []),
      ],
      never_change_price: false,
      max_discount_percent: 10,
      reviewed: true,
    });
    const revision = () =>
      scalar("select revision from company_settings where organization_id=$1", [
        orgs[k],
      ]);
    const mid = await scalar("select company_create_manual($1,$2,$3)", [
      orgs[k],
      await revision(),
      "Manual Central " + k,
    ]);
    await scalar("select company_publish_manual($1,$2,$3)", [
      orgs[k],
      mid,
      await revision(),
    ]);
    await scalar("select company_set_activation($1,$2,true,true)", [
      orgs[k],
      await revision(),
    ]);
    const pr = await scalar(
      "select revision from consumer_pages where organization_id=$1",
      [orgs[k]],
    );
    await rpc("consumer_publish_page", {
      p_org: orgs[k],
      p_manual: mid,
      p_enabled: true,
      p_show_prices: true,
      p_expected_revision: pr,
    });
  }
  const requests = {},
    codes = {};
  if (tickets)
    for (const [k, u] of [
      ["A", "alice"],
      ["B", "bob"],
    ]) {
      await as(u);
      const p = await rpc("consumer_public_page", {
          p_slug: k === "A" ? "ms-auto-ficticia" : "horizonte-ficticio",
        }),
        s = p.services.find((x) => x.price_mode === "fixed");
      const q = await rpc("consumer_create_request", {
        p_slug: p.slug,
        p_revision: p.revision,
        p_service: s.code,
        p_addons: [],
        p_answers: { [s.questions[0].code]: "Carro de teste" },
        p_customer: {
          name: k === "A" ? "Ana • Fictícia" : "Bruno • Fictício",
          whatsapp: "81999990000",
          accepted_notice: true,
          notice_version: "consumer-v1",
        },
        p_notes: "Cuidado especial no tecido",
        p_contact: false,
        p_expected_cents: 12000,
        p_key: randomUUID(),
      });
      await rpc("consumer_submit_request", {
        p_code: q.code,
        p_attachment_count: 0,
        p_key: randomUUID(),
      });
      requests[k] = q.code;
      const t = await rpc("central_consumer_thread", { p_request: q.code });
      codes[k] = t.code;
      await rpc("central_consumer_send", {
        p_request: q.code,
        p_body: "Olá! Gostaria de confirmar os detalhes.",
        p_key: randomUUID(),
      });
    }
  await db.exec("commit;reset role");
  return { requests, codes };
}
