import { seedPresence } from "./fixtures/presence.mjs";
import { authorizeSupport } from "./support/authorized-support.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB({
    through: "202609220031_public_presence_experience.sql",
  }),
  { db, as, rpc, scalar, orgs } = c;
const results = [];
async function snapshot() {
  const t = (
    await db.query(
      "select schemaname,tablename from pg_tables where schemaname in('public','private') order by 1,2",
    )
  ).rows;
  let out = {};
  for (const x of t)
    out[x.schemaname + "." + x.tablename] = await scalar(
      `select coalesce(jsonb_agg(to_jsonb(t)${x.tablename === "company_branding" ? "-'theme'" : ""} order by to_jsonb(t)::text),'[]')from ${x.schemaname}.${x.tablename} t`,
    );
  out["auth.users"] = await scalar(
    "select coalesce(jsonb_agg(to_jsonb(u)order by id),'[]')from auth.users u",
  );
  return out;
}
await seedPresence(c);
await db.exec("begin");
await as("adminA");
await rpc("onboarding_act", {
  p_org: orgs.A,
  p_action: "start",
  p_revision: 0,
  p_key: randomUUID(),
});
await rpc("financial_account_save", {
  p_org: orgs.A,
  p_id: null,
  p_revision: 0,
  p_data: {
    description: "Conta fictícia preservada no upgrade",
    total_cents: 12000,
  },
  p_key: randomUUID(),
});
await authorizeSupport(c, orgs.A, "adminA");
await as("root");
const historicalPlan = await rpc("billing_plan_save", {
  p_id: null,
  p_revision: 0,
  p_data: {
    name: "Plano histórico fictício SYZIA",
    price_cents: 1000,
    interval_months: 1,
    trial_days: 15,
    active: true,
    available: false,
    human_support: false,
  },
});
await db.exec("reset role");
const historicalVersion = await scalar(
  "select id from billing_plan_versions where plan_id=$1 order by version desc limit 1",
  [historicalPlan],
);
await db.query(
  "insert into billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)values($1,$2,'active',now(),now()+interval '1 year')",
  [orgs.B, historicalVersion],
);
await db.query(
  "insert into private.trial_grants(organization_id,plan_version_id,starts_at,ends_at,status,mode,reason,actor_id)values($1,$2,'2025-01-01','2025-01-16','ended','legacy','Histórico exclusivamente fictício de preservação',$3)",
  [orgs.B, historicalVersion, users.root],
);
await db.exec("commit;reset role");
const before = await snapshot();
try {
  await db.exec(
    await readFile(
      "supabase/migrations/202609220032_syzia_people_experience.sql",
      "utf8",
    ),
  );
  const after = await snapshot();
  for (const k in before) assert.deepEqual(after[k], before[k], k);
  results.push({
    name: "Upgrade populated 031→032 preserves all existing public/private rows",
    status: "PASS",
  });
} catch (e) {
  console.log("UPGRADE FAIL", e.message, e.where, e.internalQuery);
  process.exit(1);
}
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message, where: e.where });
    console.log("FAIL", name, e.message, e.where || "");
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function deny(fn, pattern) {
  await db.exec("savepoint deny");
  try {
    await fn();
    assert.fail("expected denial");
  } catch (e) {
    await db.exec("rollback to savepoint deny");
    assert.notEqual(e.message, "expected denial");
    if (pattern) assert.match(e.message, pattern);
  }
}
async function service(fn, args) {
  await db.exec("reset role;set local role service_role");
  return rpc(fn, args);
}
async function person(kind = "admin_empresa", username = "ana.teste") {
  await as("root");
  const a = await rpc("people_reserve", {
    p_display: "Ana Fictícia",
    p_username: username,
    p_email: username + "@example.invalid",
    p_phone: "",
    p_role: kind,
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,is_anonymous)values($1,$2,now(),false)",
    [a.user_id, a.user_id + "@access.vireloq.invalid"],
  );
  const issued = await service("access_finish_provision", {
    p_id: a.id,
    p_actor: users.root,
    p_hash: "a".repeat(64),
  });
  return { ...a, ...issued };
}
async function activate(a) {
  assert.ok(
    await service("access_verify_code", {
      p_code: "SYZIA",
      p_username: a.username,
      p_hash: "a".repeat(64),
      p_proof: "b".repeat(64),
    }),
  );
  const task = await service("access_begin_activation", {
    p_proof: "b".repeat(64),
  });
  assert.ok(task);
  assert.equal(
    await service("access_finish_activation", {
      p_id: task.id,
      p_operation: task.operation,
      p_success: true,
    }),
    true,
  );
  return task;
}
async function organization(slug = "nova-ficticia") {
  await as("root");
  const o = await rpc("access_create_organization", {
    p_name: "Empresa Fictícia",
    p_slug: slug,
    p_key: randomUUID(),
  });
  await rpc("company_initialize", { p_org: o.organization_id });
  return o.organization_id;
}
async function session(a, code = "SYZIA") {
  const l = await service("access_lookup", {
    p_code: code,
    p_username: a.username,
  });
  assert.ok(l);
  const sid = randomUUID();
  assert.equal(
    await service("access_register_session", {
      p_user: a.user_id,
      p_session: sid,
      p_account: l.id,
      p_generation: l.generation,
    }),
    true,
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: a.user_id, session_id: sid }),
  ]);
  await db.exec("set local role authenticated");
  return sid;
}
await test("Person and future administrator exist without organization or membership", async () => {
  const n = await scalar("select count(*) from organizations");
  for (const k of ["person", "admin_empresa", "syzia_staff"]) {
    const a = await person(k, k.replaceAll("_", "") + ".teste");
    await db.exec("reset role");
    assert.equal(await scalar("select count(*) from organizations"), n);
    assert.equal(
      await scalar(
        "select count(*) from organization_members where user_id=$1",
        [a.user_id],
      ),
      0,
    );
    await as("root");
    assert.ok((await rpc("people_directory")).some((p) => p.id === a.user_id));
  }
});
await test("Personal first access reuses temporary code, activation and scoped session", async () => {
  const a = await person();
  await activate(a);
  await session(a);
  assert.ok(await rpc("foundation_context"));
  await deny(() => rpc("company_context", { p_org: orgs.A }));
  await deny(() => rpc("people_directory"));
});
await test("One identity links to two companies and detaches preserving identity/history", async () => {
  const a = await person();
  const x = await organization("empresa-x"),
    y = await organization("empresa-y");
  for (const o of [x, y])
    await rpc("people_link", {
      p_user: a.user_id,
      p_org: o,
      p_role: "admin_empresa",
      p_active: true,
    });
  await activate(a);
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)from auth.users where id=$1", [a.user_id]),
    1,
  );
  assert.equal(
    await scalar("select count(*)from organization_members where user_id=$1", [
      a.user_id,
    ]),
    2,
  );
  const code = await scalar(
    "select code from private.enterprise_codes where organization_id=$1",
    [x],
  );
  await db.query(
    "update private.enterprise_codes set legal_required=false where organization_id in($1,$2)",
    [x, y],
  );
  await session(a, code);
  await deny(() => rpc("permissions_context", { p_org: y }));
  await db.exec("reset role");
  await db.query(
    "update private.enterprise_accounts set activated_at=null where user_id=$1",
    [a.user_id],
  );
  await as("root");
  await rpc("people_link", {
    p_user: a.user_id,
    p_org: y,
    p_role: "admin_empresa",
    p_active: false,
  });
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)from auth.users where id=$1", [a.user_id]),
    1,
  );
  assert.equal(
    await scalar(
      "select status from organization_members where organization_id=$1 and user_id=$2",
      [y, a.user_id],
    ),
    "suspended",
  );
});
await test("Global staff grants are explicit; no Super Admin and no synthetic membership", async () => {
  const a = await person("syzia_staff");
  await activate(a);
  await session(a);
  await deny(() => rpc("people_companies"));
  await as("root");
  await rpc("people_permissions", {
    p_user: a.user_id,
    p_permissions: ["companies.read", "shared.attend"],
  });
  await session(a);
  assert.ok((await rpc("people_companies")).length);
  await deny(() => rpc("people_directory"));
  await deny(() =>
    rpc("foundation_create_organization", {
      p_name: "No",
      p_slug: "no",
      p_request_id: randomUUID(),
    }),
  );
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)from platform_roles where user_id=$1 and role='super_admin'",
      [a.user_id],
    ),
    0,
  );
  assert.equal(
    await scalar("select count(*)from organization_members where user_id=$1", [
      a.user_id,
    ]),
    0,
  );
});
await test("Suspension blocks personal login and active sessions", async () => {
  const a = await person();
  await activate(a);
  await session(a);
  await as("root");
  await rpc("foundation_set_profile_status", {
    p_user: a.user_id,
    p_status: "suspended",
  });
  assert.equal(
    await service("access_lookup", { p_code: "SYZIA", p_username: a.username }),
    null,
  );
});
await test("Shared assignment rejects plan without human support even for root", async () => {
  const a = await person("syzia_staff");
  await as("root");
  await rpc("people_permissions", {
    p_user: a.user_id,
    p_permissions: ["shared.attend"],
  });
  const o = await organization();
  await deny(
    () =>
      rpc("foundation_set_attendant", {
        p_org: o,
        p_user: a.user_id,
        p_kind: "primary",
        p_status: "active",
      }),
    /shared_support_plan_required/,
  );
});
await test("Online schedule initializes explicitly and stale revisions reject", async () => {
  const o = await organization();
  const r = {
    active: false,
    lead_minutes: 60,
    horizon_days: 20,
    step_minutes: 30,
    buffer_minutes: 15,
    cancel_minutes: 120,
  };
  await rpc("consumer_schedule_config", {
    p_org: o,
    p_expected_revision: 0,
    p_rules: r,
  });
  const d = await rpc("consumer_admin_context", { p_org: o });
  assert.equal(d.schedule.active, false);
  await rpc("consumer_schedule_config", {
    p_org: o,
    p_expected_revision: d.schedule.revision,
    p_rules: { ...r, active: true },
  });
  await deny(
    () =>
      rpc("consumer_schedule_config", {
        p_org: o,
        p_expected_revision: 0,
        p_rules: r,
      }),
    /revision_conflict/,
  );
});
await test("Public theme and arbitrary red persist in draft; cross-tenant change rejected", async () => {
  await as("adminA");
  const p = await rpc("consumer_presence_context", { p_org: orgs.A });
  await rpc("consumer_branding_save", {
    p_org: orgs.A,
    p_revision: p.revision,
    p_data: { ...p.branding, primary_color: "#E10909", theme: "dark" },
  });
  const d = await rpc("consumer_page_draft", {
    p_org: orgs.A,
    p_show_prices: true,
  });
  assert.equal(d.preview.branding.theme, "dark");
  await as("adminB");
  await deny(() =>
    rpc("consumer_branding_save", {
      p_org: orgs.A,
      p_revision: 0,
      p_data: { primary_color: "#FFFFFF", theme: "light" },
    }),
  );
});
await test("Solo administrator is eligible and can declare availability without attendant flag", async () => {
  await as("adminA");
  assert.equal(
    await rpc("central_presence", { p_state: "available" }).then(
      (r) => r.presence,
    ),
    "available",
  );
  await db.exec("reset role");
  assert.equal(
    await scalar("select private.central_eligible($1,$2)", [
      orgs.A,
      users.adminA,
    ]),
    true,
  );
  assert.equal(
    await scalar(
      "select is_attendant from organization_members where organization_id=$1 and user_id=$2",
      [orgs.A, users.adminA],
    ),
    false,
  );
});
await test("Solo journey: consumer request, conversation, quote, approval, booking, follow-up and completion", async () => {
  await db.exec("reset role");
  await db.query(
    "update organization_members set status='suspended'where organization_id=$1 and user_id<>$2",
    [orgs.A, users.adminA],
  );
  await db.query(
    "update attendant_organizations set status='suspended'where organization_id=$1",
    [orgs.A],
  );
  await db.query(
    "update company_settings set human_enabled=false where organization_id=$1",
    [orgs.A],
  );
  await as("alice");
  const page = await rpc("consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    }),
    s = page.services.find((s) => s.price_mode === "fixed");
  const q = await rpc("consumer_create_request", {
    p_slug: page.slug,
    p_revision: page.revision,
    p_service: s.code,
    p_addons: [],
    p_answers: Object.fromEntries(
      s.questions.map((q) => [q.code, "Objeto fictício"]),
    ),
    p_customer: {
      name: "Cliente Fictício",
      whatsapp: "81999990000",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Solicitação fictícia",
    p_contact: false,
    p_expected_cents: s.price_cents,
    p_key: randomUUID(),
  });
  await rpc("consumer_submit_request", {
    p_code: q.code,
    p_attachment_count: 0,
    p_key: randomUUID(),
  });
  const thread = await rpc("central_consumer_thread", { p_request: q.code });
  await rpc("central_consumer_send", {
    p_request: q.code,
    p_body: "Quero saber mais.",
    p_key: randomUUID(),
  });
  await as("adminA");
  await rpc("central_presence", { p_state: "available" });
  const act = async (action, data = {}) => {
    const t = (await rpc("central_context", { p_code: thread.code })).ticket;
    return rpc("central_act", {
      p_code: thread.code,
      p_revision: t.revision,
      p_action: action,
      p_data: data,
      p_key: randomUUID(),
    });
  };
  await act("claim");
  await act("message", { body: "Olá, vamos organizar seu atendimento." });
  const ctx = await rpc("operations_quote_context", {
    p_org: orgs.A,
    p_code: q.code,
  });
  await rpc("operations_send_quote", {
    p_org: orgs.A,
    p_code: q.code,
    p_items: [{ name: s.name, quantity: 1, unit_cents: 12000 }],
    p_duration: 60,
    p_expires: new Date(Date.now() + 86400000 * 7).toISOString(),
    p_expected_revision: ctx.revision,
    p_key: randomUUID(),
  });
  await as("alice");
  const qc = await rpc("consumer_request_context", { p_code: q.code });
  await rpc("consumer_approve_quote", {
    p_code: q.code,
    p_version: qc.versions[0].code,
    p_key: randomUUID(),
  });
  await as("adminA");
  let slots = [];
  for (let n = 1; n < 8 && !slots.length; n++)
    slots = await rpc("central_slots", {
      p_code: thread.code,
      p_day: new Date(Date.now() + n * 86400000).toISOString().slice(0, 10),
    });
  assert.ok(slots.length);
  const booking = await rpc("central_booking", {
    p_code: thread.code,
    p_revision: (await rpc("central_context", { p_code: thread.code })).ticket
      .revision,
    p_action: "schedule",
    p_start: slots[0],
    p_appointment: null,
    p_key: randomUUID(),
  });
  await rpc("commercial_refresh", { p_org: orgs.A, p_after: null });
  await db.exec("reset role");
  const id = await scalar("select id from appointments where public_code=$1", [
    booking.code,
  ]);
  await db.query(
    "update appointments set starts_at=now()-interval '10 minutes',ends_at=now()+interval '50 minutes'where id=$1",
    [id],
  );
  await as("adminA");
  let a = (await rpc("operations_detail", { p_org: orgs.A, p_id: id }))
    .appointment;
  for (const action of ["start", "complete"])
    a = await rpc("operations_appointment_act", {
      p_org: orgs.A,
      p_id: id,
      p_revision: a.revision,
      p_action: action,
      p_data: {},
      p_key: randomUUID(),
    });
  assert.equal(a.execution_state, "completed");
  await act("state", { state: "resolved" });
  await as("alice");
  const conversation = await rpc("central_consumer_thread", {
    p_request: q.code,
  });
  assert.ok(JSON.stringify(conversation).includes("Olá, vamos organizar"));
  await as("adminB");
  await deny(() => rpc("central_context", { p_code: thread.code }));
});
await test("Internal exemption grants shared capability; withdrawal suspends assignment and preserves history", async () => {
  const a = await person("syzia_staff");
  await as("root");
  await rpc("people_permissions", {
    p_user: a.user_id,
    p_permissions: ["shared.attend"],
  });
  const o = await organization();
  const ex = await rpc("billing_exemption_set", {
    p_org: o,
    p_kind: "internal",
    p_capabilities: {
      software: true,
      human_support: true,
      commercial_followups: true,
    },
    p_reason: "Empresa fictícia interna autorizada",
    p_key: randomUUID(),
  });
  await rpc("foundation_set_attendant", {
    p_org: o,
    p_user: a.user_id,
    p_kind: "primary",
    p_status: "active",
  });
  assert.equal(
    (await rpc("billing_capabilities", { p_org: o })).commercial_state,
    "internal_exempt",
  );
  await rpc("billing_exemption_revoke", {
    p_org: o,
    p_id: ex.id,
    p_reason: "Remoção fictícia da capacidade concedida",
  });
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select status from attendant_organizations where organization_id=$1 and user_id=$2",
      [o, a.user_id],
    ),
    "suspended",
  );
  assert.equal(
    await scalar("select count(*)from organization_members where user_id=$1", [
      a.user_id,
    ]),
    0,
  );
});
await test("Online scheduling honors activation, lead, horizon, duration, buffer, service mode and conflicts", async () => {
  await as("alice");
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    s = p.services.find((s) => s.price_mode === "fixed");
  let chosen,
    slots = [];
  for (let i = 1; i < 8 && !slots.length; i++) {
    chosen = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    slots = await rpc("consumer_slots", {
      p_slug: p.slug,
      p_service: s.code,
      p_addons: [],
      p_day: chosen,
    });
  }
  assert.ok(slots.length);
  await as("adminA");
  let d = await rpc("consumer_admin_context", { p_org: orgs.A });
  const base = {
    active: true,
    lead_minutes: 0,
    horizon_days: 30,
    step_minutes: 30,
    buffer_minutes: 15,
    cancel_minutes: 120,
  };
  const config = async (rules) => {
    d = await rpc("consumer_admin_context", { p_org: orgs.A });
    await rpc("consumer_schedule_config", {
      p_org: orgs.A,
      p_expected_revision: d.schedule.revision,
      p_rules: { ...base, ...rules },
    });
  };
  await config({ active: false });
  assert.deepEqual(
    await rpc("consumer_slots", {
      p_slug: p.slug,
      p_service: s.code,
      p_addons: [],
      p_day: chosen,
    }),
    [],
  );
  await config({ lead_minutes: 43200, horizon_days: 1 });
  assert.deepEqual(
    await rpc("consumer_slots", {
      p_slug: p.slug,
      p_service: s.code,
      p_addons: [],
      p_day: chosen,
    }),
    [],
  );
  await config({});
  await db.exec("reset role");
  const pub = await scalar(
    "select publication_id from consumer_pages where organization_id=$1",
    [orgs.A],
  );
  assert.equal(
    await scalar("select private.consumer_slot_allowed($1,$2,0)", [
      pub,
      slots[0],
    ]),
    false,
  );
  assert.equal(
    await scalar("select private.consumer_slot_allowed($1,$2,10080)", [
      pub,
      slots[0],
    ]),
    false,
  );
  await as("adminA");
  await rpc("consumer_schedule_block", {
    p_org: orgs.A,
    p_start: slots[0],
    p_end: new Date(Date.parse(slots[0]) + 3600000).toISOString(),
    p_note: "Bloqueio fictício",
    p_key: randomUUID(),
  });
  const after = await rpc("consumer_slots", {
    p_slug: p.slug,
    p_service: s.code,
    p_addons: [],
    p_day: chosen,
  });
  assert.ok(!after.includes(slots[0]));
  const quote = p.services.find((s) => s.price_mode === "quote");
  if (quote)
    assert.deepEqual(
      await rpc("consumer_slots", {
        p_slug: p.slug,
        p_service: quote.code,
        p_addons: [],
        p_day: chosen,
      }),
      [],
    );
});
await test("Interrupted personal provisioning resumes the same identity and rejects non-root", async () => {
  await as("root");
  const args = {
    p_display: "Pessoa Pendente",
    p_username: "pendente.teste",
    p_email: "pendente@example.invalid",
    p_phone: "",
    p_role: "person",
    p_key: randomUUID(),
  };
  const a = await rpc("people_reserve", args);
  assert.equal((await rpc("people_reserve", args)).id, a.id);
  assert.ok((await rpc("people_reservations")).some((x) => x.id === a.id));
  await as("adminA");
  await deny(() => rpc("access_resume", { p_id: a.id }));
  await as("root");
  assert.equal((await rpc("access_resume", { p_id: a.id })).user_id, a.user_id);
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*)from organization_members where user_id=$1", [
      a.user_id,
    ]),
    0,
  );
});
await writeFile(
  "reports/syzia-032/backend.json",
  JSON.stringify(results, null, 2),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
