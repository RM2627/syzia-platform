import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedPresence } from "./fixtures/presence.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
import { authorizeSupport } from "./support/authorized-support.mjs";
const c = await consumerDB({
    through: "202609220032_syzia_people_experience.sql",
  }),
  { db, rpc, scalar, as, orgs } = c,
  results = [];
const sessions = new Map();
async function act(user, fn) {
  await db.exec("begin");
  try {
    await as(user);
    if (sessions.has(user))
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: users[user] || user,
          session_id: sessions.get(user),
          is_anonymous: false,
        }),
      ]);
    const r = await fn();
    await db.exec("commit;reset role");
    return r;
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
async function service(name, args) {
  await db.exec("begin;set local role service_role");
  try {
    const x = await rpc(name, args);
    await db.exec("commit;reset role");
    return x;
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL", name, e.message, e.where);
    throw e;
  }
}
const snap = async () => {
  const out = {};
  for (const t of (
    await db.query(
      "select schemaname,tablename from pg_tables where schemaname in('public','private')order by 1,2",
    )
  ).rows)
    out[t.schemaname + "." + t.tablename] = (
      await db.query(
        `select to_jsonb(t) row from ${t.schemaname}.${t.tablename} t`,
      )
    ).rows.map((x) => x.row);
  out["auth.users"] = (
    await db.query("select to_jsonb(u) row from auth.users u")
  ).rows.map((x) => x.row);
  return out;
};
try {
  await seedPresence(c);
  await seedCommercial(c);
  const historicalPerson = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at)values($1,'equipe-historica@example.invalid',now())",
    [historicalPerson],
  );
  await db.query(
    "insert into private.enterprise_accounts(user_id,username,display_name,contact_email,role,state,requested_by,request_key,activated_at)values($1,'equipe.historica','Equipe Histórica','equipe-historica@example.invalid','syzia_staff','active',$2,$3,now())",
    [historicalPerson, users.root, randomUUID()],
  );
  await db.query(
    "insert into private.people_grants values($1,array['people.read'])",
    [historicalPerson],
  );
  await db.query(
    "insert into private.organization_permissions(organization_id,user_id,action,scope,granted,updated_by)values($1,$2,'finance.expenses.record','organization',true,$3)",
    [orgs.A, users.worker, users.adminA],
  );
  await db.query(
    "insert into appointments(organization_id,resource_id,kind,starts_at,ends_at,note)select $1,id,'block',now()+interval '30 days',now()+interval '30 days 1 hour','Bloqueio histórico fictício'from schedule_resources where organization_id=$1 limit 1",
    [orgs.A],
  );
  await act("adminA", () => rpc("onboarding_context", { p_org: orgs.A }));
  const historicalOrg = await act("root", () =>
    rpc("access_create_organization", {
      p_name: "Trial histórico fictício",
      p_slug: "trial-historico-033",
      p_key: randomUUID(),
    }),
  );
  const historicalPlan = await act("root", () =>
    rpc("billing_plan_save", {
      p_id: null,
      p_revision: 0,
      p_data: {
        name: "Trial histórico",
        active: true,
        available: true,
        price_cents: 9900,
        interval_months: 1,
        trial_days: 15,
      },
    }),
  );
  const review = await act("root", () =>
    rpc("billing_subscription_action", {
      p_org: historicalOrg.organization_id,
      p_action: "trial",
      p_plan: historicalPlan,
      p_revision: 0,
      p_key: randomUUID(),
    }),
  );
  await act("root", () =>
    rpc("billing_trial_admin", {
      p_org: historicalOrg.organization_id,
      p_action: "approve",
      p_request: review.request_id,
      p_revision: 0,
      p_days: 15,
      p_reason: "Exceção administrativa fictícia antes do upgrade",
      p_override: true,
      p_key: randomUUID(),
    }),
  );

  await act("adminA", () =>
    rpc("financial_expense_save", {
      p_org: orgs.A,
      p_data: {
        description: "Despesa histórica",
        amount_cents: 2000,
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Recife",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        method: "pix",
        category: "Histórico",
      },
      p_key: randomUUID(),
    }),
  );
  const before = await snap();
  await writeFile(
    "reports/syzia-033/upgrade-tables.json",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(before).map(([name, rows]) => [name, rows.length]),
      ),
      null,
      2,
    ),
  );
  await test("Upgrade 032→033 preserves existing populated rows, identity, operations and financial facts", async () => {
    await db.exec(
      await readFile(
        "supabase/migrations/202609240033_acquisition_selfservice_finance.sql",
        "utf8",
      ),
    );
    const after = await snap();
    for (const [table, rows] of Object.entries(before))
      for (const row of rows)
        assert.ok(
          after[table].some((candidate) =>
            Object.keys(row).every(
              (k) => JSON.stringify(candidate[k]) === JSON.stringify(row[k]),
            ),
          ),
          "Preserve " + table,
        );
  });
  await test("Manual trial without payment remains auditable and extendable after upgrade", async () => {
    const org = historicalOrg.organization_id;
    const ctx = await act("root", () => rpc("billing_context", { p_org: org }));
    assert.equal(ctx.subscription.state, "trial");
    assert.equal(ctx.trial.grants[0].mode, "administrative");
    assert.equal(ctx.invoices.length, 0);
    await act("root", () =>
      rpc("billing_trial_admin", {
        p_org: org,
        p_action: "extend",
        p_request: null,
        p_revision: ctx.subscription.revision,
        p_days: 3,
        p_reason: "Extensão fictícia auditável sem pagamento",
        p_override: true,
        p_key: randomUUID(),
      }),
    );
    assert.ok(
      await scalar(
        "select count(*)from private.trial_audit where organization_id=$1 and actor_id=$2 and action='extend'",
        [org, users.root],
      ),
    );
  });
  await test("Commercial global grants are explicit and do not grant tenant or financial access", async () => {
    await assert.rejects(
      act(historicalPerson, () => rpc("acquisition_context")),
      /access_denied/,
    );
    await db.query(
      "update private.people_grants set permissions=array['acquisition.read']where user_id=$1",
      [historicalPerson],
    );
    assert.equal(
      (await act(historicalPerson, () => rpc("acquisition_context")))
        .can_manage,
      false,
    );
    await assert.rejects(
      act(historicalPerson, () =>
        rpc("acquisition_lead_update", {
          p_id: randomUUID(),
          p_revision: 1,
          p_state: "contacted",
        }),
      ),
      /access_denied/,
    );
    await assert.rejects(
      act(historicalPerson, () =>
        rpc("financial_summary", {
          p_org: orgs.A,
          p_from: "2026-09-01",
          p_to: "2026-09-30",
        }),
      ),
      /permission_denied/,
    );
  });
  let plan;
  await test("Only explicitly published plan versions appear publicly", async () => {
    plan = await act("root", () =>
      rpc("billing_plan_save", {
        p_id: null,
        p_revision: 0,
        p_data: {
          name: "Plano fictício 033",
          description: "Exclusivo para teste local",
          price_cents: 3900,
          interval_months: 1,
          trial_days: 15,
          active: true,
          available: true,
          site_visible: true,
          self_service: true,
          self_service_trial: true,
          human_support: false,
        },
      }),
    );
    const visible = await act("anon", () => rpc("acquisition_plans"));
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, plan);
    assert.equal(visible[0].version.price_cents, 3900);
  });
  await test("Contact is lead-only, idempotent and inaccessible to tenant administrators", async () => {
    const authCount = await scalar("select count(*) from auth.users"),
      orgCount = await scalar("select count(*)from organizations");
    const args = {
      p_key: randomUUID(),
      p_name: "Pessoa Fictícia",
      p_company: "Empresa de teste",
      p_phone: "11999999999",
      p_email: "lead@example.invalid",
      p_interest: "Conhecer serviços",
    };
    await service("acquisition_lead_submit", args);
    await service("acquisition_lead_submit", args);
    assert.equal(
      await scalar("select count(*)from private.acquisition_leads"),
      1,
    );
    assert.equal(await scalar("select count(*)from auth.users"), authCount);
    assert.equal(await scalar("select count(*)from organizations"), orgCount);
    await assert.rejects(
      act("adminA", () => rpc("acquisition_context")),
      /access_denied/,
    );
    await assert.rejects(
      act("anon", () => rpc("acquisition_lead_submit", args)),
      /permission denied/,
    );
  });
  const person = randomUUID();
  let personal, draft, completed;
  await test("Confirmed self-service identity uses existing accounts/session infrastructure", async () => {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at)values($1,'titular033@example.invalid',now())",
      [person],
    );
    personal = await service("access_selfservice_identity", {
      p_user: person,
      p_name: "Titular Fictício",
      p_username: "titular.ficticio",
    });
    sessions.set(person, randomUUID());
    assert.equal(
      await service("access_register_session", {
        p_user: person,
        p_session: sessions.get(person),
        p_account: personal.id,
        p_generation: personal.generation,
      }),
      true,
    );
    assert.equal(
      await scalar(
        "select count(*)from organization_members where user_id=$1",
        [person],
      ),
      0,
    );
  });
  const saveArgs = {
    p_id: null,
    p_revision: 0,
    p_name: "Empresa Self-service Fictícia",
    p_slug: "selfservice-ficticia-033",
    p_phone: "11999999999",
    p_kind: "CPF",
    p_document: "52998224725",
    p_plan: null,
    p_key: randomUUID(),
  };
  await test("Resume registration without another identity, organization, trial or changed-key replay", async () => {
    saveArgs.p_plan = plan;
    draft = await act(person, () => rpc("selfservice_save", saveArgs));
    assert.equal(draft.state, "payment_pending");
    assert.deepEqual(
      await act(person, () => rpc("selfservice_save", saveArgs)),
      draft,
    );
    assert.equal(
      await scalar(
        "select count(*)from private.selfservice_drafts where user_id=$1",
        [person],
      ),
      1,
    );
    assert.equal(
      await scalar(
        "select count(*)from organization_members where user_id=$1",
        [person],
      ),
      0,
    );
    await assert.rejects(
      act(person, () =>
        rpc("selfservice_save", { ...saveArgs, p_name: "Outro nome" }),
      ),
      /idempotency_conflict/,
    );
  });
  await test("Trial requires a server-validated payment method and explicit consent", async () => {
    await assert.rejects(
      act(person, () =>
        rpc("selfservice_complete", {
          p_id: draft.id,
          p_revision: draft.revision,
          p_consent: true,
          p_conditions: "selfservice-033",
        }),
      ),
      /selfservice_payment_required/,
    );
    await assert.rejects(
      act(person, () =>
        rpc("selfservice_payment_bind", {
          p_user: person,
          p_id: draft.id,
          p_revision: draft.revision,
          p_reference: "fake-method-reference",
          p_provider: "mock",
          p_simulation: true,
        }),
      ),
      /permission denied/,
    );
    await db.exec("update private.billing_runtime set mock_enabled=false");
    await assert.rejects(
      service("selfservice_payment_bind", {
        p_user: person,
        p_id: draft.id,
        p_revision: draft.revision,
        p_reference: "fake-method-reference",
        p_provider: "mock",
        p_simulation: true,
      }),
      /billing_provider_not_configured/,
    );
    await db.exec("update private.billing_runtime set mock_enabled=true");
    draft = await service("selfservice_payment_bind", {
      p_user: person,
      p_id: draft.id,
      p_revision: draft.revision,
      p_reference: "fake-method-reference",
      p_provider: "mock",
      p_simulation: true,
    });
    await assert.rejects(
      act(person, () =>
        rpc("selfservice_complete", {
          p_id: draft.id,
          p_revision: draft.revision,
          p_consent: false,
          p_conditions: "selfservice-033",
        }),
      ),
      /selfservice_consent_required/,
    );
  });
  await test("Finalize once: existing identity, first ADM, audited consent/trial and existing onboarding", async () => {
    const args = {
      p_id: draft.id,
      p_revision: draft.revision,
      p_consent: true,
      p_conditions: "selfservice-033",
    };
    completed = await act(person, () => rpc("selfservice_complete", args));
    assert.equal(completed.state, "completed");
    assert.deepEqual(
      await act(person, () => rpc("selfservice_complete", args)),
      completed,
    );
    assert.equal(
      await scalar(
        "select count(*)from organization_members where user_id=$1",
        [person],
      ),
      1,
    );
    const contexts = await service("access_identity_contexts", {
      p_user: person,
    });
    await service("access_select_context", {
      p_user: person,
      p_session: sessions.get(person),
      p_account: contexts.companies[0].id,
    });
    const legal = (
      await db.query("select kind,version from legal_documents where current")
    ).rows;
    await act(person, () =>
      rpc("access_legal_accept", {
        p_terms: legal.find((x) => x.kind === "terms").version,
        p_privacy: legal.find((x) => x.kind === "privacy").version,
      }),
    );
    await act(person, () =>
      rpc("company_initialize", { p_org: completed.organization_id }),
    );
    const onboarding = await act(person, () =>
      rpc("onboarding_context", { p_org: completed.organization_id }),
    );
    assert.ok(onboarding);
    assert.equal(
      await scalar(
        "select count(*)from private.selfservice_consents where draft_id=$1",
        [draft.id],
      ),
      1,
    );
    assert.equal(
      await scalar(
        "select count(*)from private.trial_grants where organization_id=$1",
        [completed.organization_id],
      ),
      1,
    );
    await assert.rejects(
      act(person, () =>
        rpc("financial_summary", {
          p_org: orgs.A,
          p_from: "2026-09-01",
          p_to: "2026-09-30",
        }),
      ),
      /permission_denied/,
    );
  });
  await test("Identity lookup keeps duplicate tenant usernames scoped; arbitrary context is rejected", async () => {
    const identity = await service("access_identity_lookup", {
      p_identifier: "titular033@example.invalid",
    });
    assert.equal(identity.user_id, person);
    const contexts = await service("access_identity_contexts", {
      p_user: person,
    });
    assert.equal(contexts.companies.length, 1);
    await assert.rejects(
      service("access_select_context", {
        p_user: person,
        p_session: sessions.get(person),
        p_account: randomUUID(),
      }),
      /access_denied/,
    );
    await db.query(
      "insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,role,state,requested_by,request_key,activated_at) values($1,$2,'titular.ficticio','Outra Pessoa','outro@example.invalid','colaborador_empresa','active',$3,$4,now())",
      [orgs.B, users.adminB, users.root, randomUUID()],
    );
    assert.equal(
      await service("access_identity_lookup", {
        p_identifier: "titular.ficticio",
      }),
      null,
    );
    assert.equal(
      (
        await service("access_identity_lookup", {
          p_identifier: "titular033@example.invalid",
        })
      ).user_id,
      person,
    );
  });
  let recurrence, occurrence;
  const now = new Date(),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Recife",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    start = today.slice(0, 8) + "01",
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
  await test("R$700 monthly forecast does not become paid; retries never duplicate competency", async () => {
    const before = await act("adminA", () =>
      rpc("financial_summary", { p_org: orgs.A, p_from: start, p_to: end }),
    );
    const args = {
      p_org: orgs.A,
      p_id: null,
      p_revision: 0,
      p_key: randomUUID(),
      p_data: {
        description: "Aluguel fictício",
        category: "Estrutura",
        amount_cents: 70000,
        frequency: "monthly",
        starts_on: start,
        ends_on: null,
        note: "Teste local",
      },
    };
    recurrence = await act("adminA", () =>
      rpc("financial_recurrence_save", args),
    );
    assert.deepEqual(
      await act("adminA", () => rpc("financial_recurrence_save", args)),
      recurrence,
    );
    const f = await act("adminA", () =>
      rpc("financial_forecast", { p_org: orgs.A, p_from: start, p_to: end }),
    );
    assert.equal(f.occurrences.length, 1);
    occurrence = f.occurrences[0];
    const summary = await act("adminA", () =>
      rpc("financial_summary", { p_org: orgs.A, p_from: start, p_to: end }),
    );
    assert.equal(summary.expenses_cents, before.expenses_cents);
    assert.equal(summary.forecast_expenses_cents, 70000);
    assert.equal(summary.result_cents, before.result_cents);
  });
  await test("Authorized confirmation records exactly one paid expense; future edits preserve paid history", async () => {
    const args = {
      p_org: orgs.A,
      p_id: occurrence.id,
      p_date: today,
      p_method: "pix",
      p_key: randomUUID(),
    };
    const paid = await act("adminA", () =>
      rpc("financial_occurrence_pay", args),
    );
    assert.deepEqual(
      await act("adminA", () =>
        rpc("financial_occurrence_pay", { ...args, p_key: randomUUID() }),
      ),
      paid,
    );
    assert.equal(
      await scalar("select count(*)from financial_expenses where id=$1", [
        paid.id,
      ]),
      1,
    );
    const edit = {
      p_org: orgs.A,
      p_id: recurrence.id,
      p_revision: 1,
      p_key: randomUUID(),
      p_data: {
        description: "Aluguel futuro",
        category: "Estrutura",
        amount_cents: 80000,
        frequency: "monthly",
        starts_on: start,
        ends_on: null,
        note: "Ajuste futuro",
        active: true,
      },
    };
    await act("adminA", () => rpc("financial_recurrence_save", edit));
    assert.equal(
      await scalar("select amount_cents from financial_expenses where id=$1", [
        paid.id,
      ]),
      70000,
    );
    await act("adminA", () =>
      rpc("financial_recurrence_save", {
        ...edit,
        p_revision: 2,
        p_key: randomUUID(),
        p_data: { ...edit.p_data, active: false },
      }),
    );
    assert.equal(
      await scalar(
        "select count(*)from financial_occurrences where recurrence_id=$1 and due_date>$2 and state='pending'",
        [recurrence.id, today],
      ),
      0,
    );
  });
  await test("Operational financial grants do not expose consolidated finances or other tenants", async () => {
    await db.query(
      "insert into private.organization_permissions(organization_id,user_id,action,scope,granted,updated_by)values($1,$2,'finance.expenses.record','organization',true,$3),($1,$2,'finance.recurring.create','organization',true,$3)on conflict(organization_id,user_id,action)do update set granted=true",
      [orgs.A, users.worker, users.adminA],
    );
    await act("worker", () =>
      rpc("financial_expense_save", {
        p_org: orgs.A,
        p_data: {
          description: "Compra operacional fictícia",
          amount_cents: 900,
          date: today,
          method: "pix",
        },
        p_key: randomUUID(),
      }),
    );
    for (const org of [orgs.A, orgs.B])
      await assert.rejects(
        act("worker", () =>
          rpc("financial_summary", { p_org: org, p_from: start, p_to: end }),
        ),
        /permission_denied/,
      );
    await assert.rejects(
      act("adminB", () =>
        rpc("financial_occurrence_pay", {
          p_org: orgs.A,
          p_id: occurrence.id,
          p_date: today,
          p_method: "pix",
          p_key: randomUUID(),
        }),
      ),
      /permission_denied/,
    );
  });
  await test("Cancel before first charge preserves trial history and prevents an invoice", async () => {
    const u = randomUUID();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at)values($1,'cancel033@example.invalid',now())",
      [u],
    );
    const a = await service("access_selfservice_identity", {
      p_user: u,
      p_name: "Pessoa Cancelamento",
      p_username: "pessoa.cancelamento",
    });
    sessions.set(u, randomUUID());
    await service("access_register_session", {
      p_user: u,
      p_session: sessions.get(u),
      p_account: a.id,
      p_generation: a.generation,
    });
    let d = await act(u, () =>
      rpc("selfservice_save", {
        ...saveArgs,
        p_name: "Cancelamento fictício",
        p_slug: "cancelamento-ficticio",
        p_document: "11144477735",
        p_key: randomUUID(),
      }),
    );
    await service("selfservice_payment_bind", {
      p_user: u,
      p_id: d.id,
      p_revision: d.revision,
      p_reference: "cancel-method-033",
      p_provider: "mock",
      p_simulation: true,
    });
    d = await act(u, () =>
      rpc("selfservice_complete", {
        p_id: d.id,
        p_revision: d.revision,
        p_consent: true,
        p_conditions: "selfservice-033",
      }),
    );
    const account = (await service("access_identity_contexts", { p_user: u }))
      .companies[0];
    await service("access_select_context", {
      p_user: u,
      p_session: sessions.get(u),
      p_account: account.id,
    });
    const legal = (
      await db.query("select kind,version from legal_documents where current")
    ).rows;
    await act(u, () =>
      rpc("access_legal_accept", {
        p_terms: legal.find((x) => x.kind === "terms").version,
        p_privacy: legal.find((x) => x.kind === "privacy").version,
      }),
    );
    const sub = await act(u, () =>
      rpc("billing_context", { p_org: d.organization_id }),
    );
    await act(u, () =>
      rpc("billing_subscription_action", {
        p_org: d.organization_id,
        p_action: "cancel",
        p_plan: null,
        p_revision: sub.subscription.revision,
        p_key: randomUUID(),
      }),
    );
    assert.equal(
      (await act(u, () => rpc("billing_context", { p_org: d.organization_id })))
        .subscription.cancel_at_end,
      true,
    );
    await db.query(
      "update billing_subscriptions set period_start=now()-interval '16 days',period_end=now()-interval '1 minute'where organization_id=$1",
      [d.organization_id],
    );
    assert.equal(
      (await service("selfservice_billing_due", { p_org: d.organization_id }))
        .cancelled,
      true,
    );
    assert.equal(
      await scalar(
        "select count(*)from billing_invoices where organization_id=$1",
        [d.organization_id],
      ),
      0,
    );
    assert.equal(
      await scalar(
        "select count(*)from private.trial_grants where organization_id=$1",
        [d.organization_id],
      ),
      1,
    );
    assert.ok(
      await act(u, () => rpc("billing_context", { p_org: d.organization_id })),
    );
    assert.equal(
      await act("anon", () =>
        rpc("consumer_public_page", { p_slug: "cancelamento-ficticio" }),
      ),
      null,
    );
  });
  await test("Payment failure blocks new operations, keeps billing accessible and supports audited regularization", async () => {
    const org = completed.organization_id;
    await db.query(
      "update billing_subscriptions set period_start=now()-interval '16 days',period_end=now()-interval '1 minute'where organization_id=$1",
      [org],
    );
    const invoice = await service("selfservice_billing_due", { p_org: org });
    await service("billing_provider_event", {
      p_event: "test-033-failed",
      p_invoice: invoice.invoice_id,
      p_state: "failed",
      p_amount: 3900,
    });
    let ctx = await act(person, () => rpc("billing_context", { p_org: org }));
    assert.equal(ctx.subscription.state, "past_due");
    assert.equal(
      await act("anon", () =>
        rpc("consumer_public_page", { p_slug: saveArgs.p_slug }),
      ),
      null,
    );
    await act("root", () =>
      rpc("billing_admin_state", {
        p_org: org,
        p_revision: ctx.subscription.revision,
        p_suspend: true,
        p_reason: "Suspensão de teste, sem política automática inventada",
      }),
    );
    ctx = await act(person, () => rpc("billing_context", { p_org: org }));
    assert.equal(ctx.subscription.state, "suspended");
    assert.equal(
      await scalar("select count(*)from organizations where id=$1", [org]),
      1,
    );
    assert.equal(
      (await service("selfservice_billing_due", { p_org: org })).blocked,
      true,
    );
    await act("root", () =>
      rpc("billing_admin_state", {
        p_org: org,
        p_revision: ctx.subscription.revision,
        p_suspend: false,
        p_reason: "Regularização de teste autorizada",
      }),
    );
  });
  await test("SaaS invoice payment converts once, not on approval or payment-method validation", async () => {
    assert.equal(
      await scalar(
        "select count(*)from private.acquisition_events where organization_id=$1 and event='converted'",
        [completed.organization_id],
      ),
      0,
    );
    await db.query(
      "update billing_subscriptions set period_start=now()-interval '16 days',period_end=now()-interval '1 minute'where organization_id=$1",
      [completed.organization_id],
    );
    const invoice = await service("selfservice_billing_due", {
      p_org: completed.organization_id,
    });
    assert.ok(invoice.invoice_id);
    assert.equal(
      (
        await service("selfservice_billing_due", {
          p_org: completed.organization_id,
        })
      ).invoice_id,
      invoice.invoice_id,
    );
    await service("billing_provider_event", {
      p_event: "test-033-paid",
      p_invoice: invoice.invoice_id,
      p_state: "paid",
      p_amount: 3900,
    });
    assert.equal(
      await scalar(
        "select state from billing_subscriptions where organization_id=$1",
        [completed.organization_id],
      ),
      "active",
    );
    assert.equal(
      await scalar(
        "select count(*)from private.acquisition_events where organization_id=$1 and event='converted'and simulation",
        [completed.organization_id],
      ),
      1,
    );
    const acquisition = await act("root", () => rpc("acquisition_context"));
    assert.equal(acquisition.indicators.real_conversions, 0);
    assert.equal(acquisition.indicators.simulated_conversions, 1);
  });
  await test("Global configuration without ADM uses original authorization, never an artificial membership", async () => {
    await act("root", () =>
      rpc("company_initialize", { p_org: historicalOrg.organization_id }),
    );
    assert.ok(
      await act("root", () =>
        rpc("onboarding_context", { p_org: historicalOrg.organization_id }),
      ),
    );
    assert.equal(
      await scalar(
        "select count(*)from organization_members where organization_id=$1 and user_id=$2",
        [historicalOrg.organization_id, users.root],
      ),
      0,
    );
  });
  await test("An existing self-service identity cannot consume another automatic trial", async () => {
    const duplicate = await act(person, () =>
      rpc("selfservice_save", {
        ...saveArgs,
        p_name: "Segunda empresa fictícia",
        p_slug: "segunda-empresa-ficticia",
        p_key: randomUUID(),
      }),
    );
    assert.equal(duplicate.state, "review");
    assert.equal(duplicate.eligibility, "previous_identity");
    assert.equal(
      await scalar(
        "select count(*)from private.trial_grants where organization_id=$1",
        [completed.organization_id],
      ),
      1,
    );
  });
  await test("Cancelling a paid recurring expense preserves history and removes only its realized amount", async () => {
    const forecast = await act("adminA", () =>
      rpc("financial_forecast", { p_org: orgs.A, p_from: start, p_to: end }),
    );
    const row = forecast.occurrences.find((x) => x.id === occurrence.id);
    const before = await act("adminA", () =>
      rpc("financial_summary", { p_org: orgs.A, p_from: start, p_to: end }),
    );
    await act("adminA", () =>
      rpc("financial_expense_cancel", {
        p_org: orgs.A,
        p_id: row.expense_id,
        p_reason: "Correção fictícia de lançamento duplicado",
        p_key: randomUUID(),
      }),
    );
    const after = await act("adminA", () =>
      rpc("financial_summary", { p_org: orgs.A, p_from: start, p_to: end }),
    );
    assert.equal(after.expenses_cents, before.expenses_cents - 70000);
    const preserved = (
      await act("adminA", () =>
        rpc("financial_forecast", { p_org: orgs.A, p_from: start, p_to: end }),
      )
    ).occurrences.find((x) => x.id === row.id);
    assert.equal(preserved.payment_cancelled, true);
    assert.equal(preserved.expense_id, row.expense_id);
  });
  await test("Suspending a previously published company blocks public entry and direct operations without removing data", async () => {
    const p = await act("anon", () =>
      rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    );
    assert.ok(p);
    const s = p.services.find((x) => x.price_mode === "fixed");
    const rev = await scalar(
      "select revision from billing_subscriptions where organization_id=$1",
      [orgs.A],
    );
    await act("root", () =>
      rpc("billing_admin_state", {
        p_org: orgs.A,
        p_revision: rev,
        p_suspend: true,
        p_reason: "Suspensão fictícia para testar bloqueio de novas operações",
      }),
    );
    assert.equal(
      await act("anon", () => rpc("consumer_public_page", { p_slug: p.slug })),
      null,
    );
    assert.ok(
      await act("adminA", () => rpc("billing_context", { p_org: orgs.A })),
    );
    await assert.rejects(
      act("adminA", () =>
        rpc("financial_expense_save", {
          p_org: orgs.A,
          p_data: {
            description: "Tentativa bloqueada",
            amount_cents: 100,
            date: today,
            method: "pix",
          },
          p_key: randomUUID(),
        }),
      ),
      /permission_denied/,
    );
    await assert.rejects(
      act("alice", () =>
        rpc("consumer_create_request", {
          p_slug: p.slug,
          p_revision: p.revision,
          p_service: s.code,
          p_addons: [],
          p_answers: { [s.questions[0].code]: "Teste" },
          p_customer: {
            name: "Consumidor Fictício",
            whatsapp: "81999990000",
            accepted_notice: true,
            notice_version: "consumer-v1",
          },
          p_notes: "Teste",
          p_contact: false,
          p_expected_cents: 12000,
          p_key: randomUUID(),
        }),
      ),
      /billing_subscription_required/,
    );
    assert.ok(
      await scalar(
        "select count(*)from quote_requests where organization_id=$1",
        [orgs.A],
      ),
    );
  });
} catch (e) {
  console.error("Test setup/scenario error", e.message, e.where, e.detail);
  process.exitCode = 1;
} finally {
  await writeFile(
    "reports/syzia-033/sql.json",
    JSON.stringify(results, null, 2),
  );
  await db.close();
}
