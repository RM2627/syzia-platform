import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { digest } from "../server/enterprise-access.mjs";
const { db, as, rpc, scalar, orgs } = await consumerDB({
  through: "202609190026_enterprise_access.sql",
});
const before = await scalar(
  "select jsonb_build_object('users',(select count(*) from auth.users),'members',(select count(*) from organization_members),'audit',(select count(*) from audit_logs),'trial',(select count(*) from private.trial_grants))",
);
await db.exec(
  await readFile(
    "supabase/migrations/202609200027_organization_activation.sql",
    "utf8",
  ),
);
assert.deepEqual(
  await scalar(
    "select jsonb_build_object('users',(select count(*) from auth.users),'members',(select count(*) from organization_members),'audit',(select count(*) from audit_logs),'trial',(select count(*) from private.trial_grants))",
  ),
  before,
);
const results = [
  {
    name: "Upgrade 026 → 027 preserves identities, memberships, audit and trial counts",
    status: "PASS",
  },
];
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.log("FAIL", name, e.message);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function deny(fn, code) {
  await db.exec("savepoint expected");
  try {
    await fn();
    assert.fail("must reject");
  } catch (e) {
    await db.exec("rollback to savepoint expected");
    assert.notEqual(e.message, "must reject");
    if (code) assert.match(e.message, new RegExp(code));
  }
}
const service = async (name, args) => {
  await db.exec("reset role");
  return rpc(name, args);
};
async function create(
  name = "Empresa Fictícia",
  slug = "empresa-ficticia",
  key = randomUUID(),
) {
  await as("root");
  return rpc("access_create_organization", {
    p_name: name,
    p_slug: slug,
    p_key: key,
  });
}
async function reserve(org) {
  await as("root");
  return rpc("access_reserve", {
    p_org: org,
    p_name: "Empresa Completa",
    p_slug: "empresa-completa",
    p_display: "Ana Silva",
    p_username: "ana.silva",
    p_email: "ana@example.invalid",
    p_phone: "",
    p_role: "admin_empresa",
    p_key: randomUUID(),
  });
}
async function prepare(org = orgs.A) {
  const a = await reserve(org);
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [a.user_id, a.user_id + "@access.vireloq.invalid"],
  );
  return {
    ...a,
    ...(await rpc("access_finish_provision", {
      p_id: a.id,
      p_actor: users.root,
      p_hash: digest("code"),
    })),
  };
}
async function pendingDelivery(a, rotate = false) {
  return service("access_delivery_prepare", {
    p_id: a.id,
    p_actor: users.root,
    p_hash: digest(rotate ? "next" : "code"),
    p_rotate: rotate,
  });
}
await test("No-admin creation generates stable code, pending legal, no fake user or membership", async () => {
  const n = await scalar("select count(*) from auth.users");
  const a = await create();
  assert.match(a.company_code, /^[A-F0-9]{12}$/);
  assert.notEqual(a.company_code, "empresa-ficticia");
  await db.exec("reset role");
  assert.equal(await scalar("select count(*) from auth.users"), n);
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where organization_id=$1",
      [a.organization_id],
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select legal_required from private.enterprise_codes where organization_id=$1",
      [a.organization_id],
    ),
    true,
  );
  await as("root");
  assert.equal(
    (await rpc("access_organizations")).find((x) => x.id === a.organization_id)
      .setup_state,
    "awaiting_admin",
  );
});
await test("Creation retries preserve organization and reject conflicting payload", async () => {
  const key = randomUUID(),
    a = await create("Empresa Nova", "empresa-nova", key),
    b = await create("Empresa Nova", "empresa-nova", key);
  assert.deepEqual(a, b);
  await deny(
    () => create("Outra Empresa", "outra-empresa", key),
    "idempotency_conflict",
  );
});
await test("Slug validation and uniqueness stay in database", async () => {
  await deny(() => create("Empresa", "INVÁLIDO"), "check");
  await create();
  await deny(() => create(), "unique");
});
await test("Enterprise admin, staff and shared attendant cannot create organizations or list global data", async () => {
  for (const actor of ["adminA", "worker", "agentA"]) {
    await as(actor);
    await deny(
      () =>
        rpc("access_create_organization", {
          p_name: "Proibida",
          p_slug: "proibida",
          p_key: randomUUID(),
        }),
      "access_denied",
    );
    await deny(() => rpc("access_organizations"), "access_denied");
  }
});
await test("Super Admin opens empty organization through existing authorization without membership", async () => {
  const a = await create();
  assert(
    (await rpc("foundation_context")).organizations.some(
      (o) => o.id === a.organization_id,
    ),
  );
  await rpc("foundation_update_organization", {
    p_org: a.organization_id,
    p_name: "Nova Empresa",
    p_status: "active",
  });
  await rpc("access_team", { p_org: a.organization_id });
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where organization_id=$1",
      [a.organization_id],
    ),
    0,
  );
  await deny(
    () =>
      rpc("access_legal_accept", {
        p_terms: "draft-2026-09-19",
        p_privacy: "draft-2026-09-19",
      }),
    "access_denied",
  );
});
await test("First administrator can be defined later with Auth/profile/member already present", async () => {
  const o = await create(),
    a = await prepare(o.organization_id);
  await db.exec("reset role");
  for (const [table, key] of [
    ["auth.users", "id"],
    ["profiles", "id"],
    ["organization_members", "user_id"],
  ])
    assert.equal(
      await scalar(`select count(*)::int from ${table} where ${key}=$1`, [
        a.user_id,
      ]),
      1,
    );
  await as("root");
  assert.equal(
    (await rpc("access_organizations")).find((x) => x.id === o.organization_id)
      .setup_state,
    "pending_activation",
  );
});
await test("Partial reservation is visible, resumable, and keeps user and organization IDs", async () => {
  const a = await reserve(null);
  assert.equal(
    (await rpc("access_organizations")).find((x) => x.id === a.organization_id)
      .setup_state,
    "incomplete",
  );
  const b = await rpc("access_resume", { p_id: a.id });
  assert.equal(a.user_id, b.user_id);
  assert.equal(a.organization_id, b.organization_id);
  await as("adminB");
  await deny(() => rpc("access_resume", { p_id: a.id }), "access_denied");
});
await test("First activation preserves all three identities and cannot choose a role", async () => {
  const a = await prepare();
  await service("access_verify_code", {
    p_code: a.company_code,
    p_username: a.username,
    p_hash: digest("code"),
    p_proof: digest("proof"),
  });
  const op = await service("access_begin_activation", {
    p_proof: digest("proof"),
  });
  assert.equal(op.user_id, a.user_id);
  await service("access_finish_activation", {
    p_id: a.id,
    p_operation: op.operation,
    p_success: true,
  });
  for (const [t, key] of [
    ["auth.users", "id"],
    ["profiles", "id"],
    ["organization_members", "user_id"],
  ])
    assert.equal(
      await scalar(`select count(*)::int from ${t} where ${key}=$1`, [
        a.user_id,
      ]),
      1,
    );
  assert.equal(
    await scalar("select count(*)::int from platform_roles where user_id=$1", [
      a.user_id,
    ]),
    0,
  );
  assert.equal(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: digest("code"),
      p_proof: digest("other"),
    }),
    null,
  );
});
await test("SMTP failure persists state but preserves provisioned access and membership", async () => {
  const a = await prepare(),
    d = await pendingDelivery(a);
  await service("access_delivery_finish", {
    p_id: a.id,
    p_attempt: d.attempt_id,
    p_result: "email_delivery_failed",
  });
  await as("root");
  const team = await rpc("access_team", { p_org: a.organization_id });
  const row = team.accounts.find((x) => x.id === a.id);
  assert.equal(row.state, "pending");
  assert.equal(row.delivery.state, "failed");
  assert.equal(row.delivery.code, "email_delivery_failed");
  assert(!JSON.stringify(team).includes(digest("code")));
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where user_id=$1",
      [a.user_id],
    ),
    1,
  );
});
await test("Resend cooldown prevents code rotation and rate limit is persisted", async () => {
  const a = await prepare();
  await pendingDelivery(a);
  await deny(() => pendingDelivery(a, true), "delivery_cooldown");
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select code_hash from private.enterprise_accounts where id=$1",
      [a.id],
    ),
    digest("code"),
  );
  await db.query(
    "update private.access_deliveries set attempted_at=now()-interval '2 minutes',window_attempts=5 where account_id=$1",
    [a.id],
  );
  await deny(() => pendingDelivery(a, true), "delivery_rate_limited");
});
await test("Resend replaces code, invalidates old proof, and late mail result cannot overwrite current state", async () => {
  const a = await prepare(),
    first = await pendingDelivery(a);
  await service("access_delivery_finish", {
    p_id: a.id,
    p_attempt: first.attempt_id,
    p_result: "accepted",
  });
  await db.query(
    "update private.access_deliveries set attempted_at=now()-interval '2 minutes' where account_id=$1",
    [a.id],
  );
  const next = await pendingDelivery(a, true);
  assert.notEqual(next.attempt_id, first.attempt_id);
  assert.equal(
    await service("access_delivery_finish", {
      p_id: a.id,
      p_attempt: first.attempt_id,
      p_result: "accepted",
    }),
    false,
  );
  await service("access_delivery_finish", {
    p_id: a.id,
    p_attempt: next.attempt_id,
    p_result: "email_delivery_failed",
  });
  assert.equal(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: digest("code"),
      p_proof: digest("proof"),
    }),
    null,
  );
  assert(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: digest("next"),
      p_proof: digest("proof"),
    }),
  );
  await as("root");
  const row = (
    await rpc("access_team", { p_org: a.organization_id })
  ).accounts.find((x) => x.id === a.id);
  assert.equal(row.delivery.state, "failed");
  assert(row.delivery.accepted_at);
});
await test("Foreign tenant cannot send/reset another organization; direct delivery RPC denied", async () => {
  const a = await prepare();
  await deny(
    () =>
      service("access_delivery_prepare", {
        p_id: a.id,
        p_actor: users.adminB,
        p_hash: digest("code"),
        p_rotate: false,
      }),
    "access_denied",
  );
  await as("adminA");
  await deny(
    () =>
      rpc("access_delivery_prepare", {
        p_id: a.id,
        p_actor: users.root,
        p_hash: digest("code"),
        p_rotate: false,
      }),
    "permission denied",
  );
});
await test("Expired code can be replaced only by authorized reset, never reused", async () => {
  const a = await prepare();
  await db.query(
    "update private.enterprise_accounts set code_expires=now()-interval '1 minute' where id=$1",
    [a.id],
  );
  await deny(() => pendingDelivery(a), "activation_invalid");
  assert(await pendingDelivery(a, true));
});
await test("Disabled and active identities cannot use pending-admin resend", async () => {
  const a = await prepare();
  await db.query(
    "update private.enterprise_accounts set state='disabled' where id=$1",
    [a.id],
  );
  await deny(() => pendingDelivery(a, true), "access_denied");
  await db.exec("reset role");
  await db.query(
    "update private.enterprise_accounts set state='active' where id=$1",
    [a.id],
  );
  await deny(() => pendingDelivery(a, true), "access_denied");
});
await test("Global audit RPC root-only and tenant RLS cannot read other organizations", async () => {
  await as("root");
  assert((await rpc("foundation_global_audit")).length > 0);
  for (const actor of ["adminA", "worker", "agentA"]) {
    await as(actor);
    await deny(() => rpc("foundation_global_audit"), "access_denied");
    assert.equal(
      await scalar(
        "select count(*)::int from audit_logs where organization_id=$1",
        [orgs.B],
      ),
      0,
    );
  }
});
await test("Revoked Super Admin loses global audit and lifecycle operations immediately", async () => {
  await db.exec("reset role");
  await db.query("update platform_roles set active=false where user_id=$1", [
    users.root,
  ]);
  await as("root");
  await deny(() => rpc("foundation_global_audit"), "access_denied");
  await deny(() => rpc("access_organizations"), "access_denied");
});
await test("Suspension revokes old session; reactivation preserves identity and requires new session", async () => {
  const a = await prepare();
  await service("access_verify_code", {
    p_code: a.company_code,
    p_username: a.username,
    p_hash: digest("code"),
    p_proof: digest("proof"),
  });
  const op = await service("access_begin_activation", {
    p_proof: digest("proof"),
  });
  await service("access_finish_activation", {
    p_id: a.id,
    p_operation: op.operation,
    p_success: true,
  });
  const sid = randomUUID(),
    lookup = await service("access_lookup", {
      p_code: a.company_code,
      p_username: a.username,
    });
  await service("access_register_session", {
    p_user: a.user_id,
    p_session: sid,
    p_account: a.id,
    p_generation: lookup.generation,
  });
  await as("root");
  await rpc("foundation_update_organization", {
    p_org: a.organization_id,
    p_name: "Empresa Suspensa",
    p_status: "suspended",
  });
  assert.equal(
    await service("access_lookup", {
      p_code: a.company_code,
      p_username: a.username,
    }),
    null,
  );
  await as("root");
  await rpc("foundation_update_organization", {
    p_org: a.organization_id,
    p_name: "Empresa Suspensa",
    p_status: "active",
  });
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select revoked from private.enterprise_sessions where session_id=$1",
      [sid],
    ),
    true,
  );
  assert.equal(
    (
      await service("access_lookup", {
        p_code: a.company_code,
        p_username: a.username,
      })
    ).user_id,
    a.user_id,
  );
});
await test("Empty organization deletion requires exact confirmation and retains append-only audit", async () => {
  const a = await create();
  await deny(
    () =>
      rpc("access_delete_organization", {
        p_org: a.organization_id,
        p_confirmation: "errado",
      }),
    "organization_confirmation_required",
  );
  assert.equal(
    (
      await rpc("access_delete_organization", {
        p_org: a.organization_id,
        p_confirmation: "Empresa Fictícia",
      })
    ).deleted,
    true,
  );
  assert.equal(
    await scalar("select count(*)::int from organizations where id=$1", [
      a.organization_id,
    ]),
    0,
  );
  assert(
    (await rpc("foundation_global_audit")).some(
      (x) =>
        x.organization_id === a.organization_id &&
        x.action === "organization_deleted",
    ),
  );
  await db.exec("reset role");
  await deny(
    () =>
      db.query("delete from audit_logs where organization_id=$1", [
        a.organization_id,
      ]),
    "audit_is_append_only",
  );
});
await test("Deleting a previous creation cannot replay that idempotency key to create a new organization", async () => {
  const key = randomUUID(),
    a = await create("Empresa Fictícia", "empresa-ficticia", key);
  await rpc("access_delete_organization", {
    p_org: a.organization_id,
    p_confirmation: "Empresa Fictícia",
  });
  await deny(
    () => create("Empresa Fictícia", "empresa-ficticia", key),
    "organization_deleted",
  );
});
await test("Admin, collaborator and attendant cannot delete a tenant", async () => {
  const a = await create();
  for (const actor of ["adminA", "worker", "agentA"]) {
    await as(actor);
    await deny(
      () =>
        rpc("access_delete_organization", {
          p_org: a.organization_id,
          p_confirmation: "Empresa Fictícia",
        }),
      "access_denied",
    );
  }
});
await test("Reserved account blocks deletion even before external Auth commit (no orphaning race)", async () => {
  const a = await reserve(null);
  assert.equal(
    (
      await rpc("access_delete_organization", {
        p_org: a.organization_id,
        p_confirmation: "Empresa Completa",
      })
    ).deleted,
    false,
  );
  assert(
    (await rpc("foundation_global_audit")).some(
      (x) => x.action === "organization_deletion_denied",
    ),
  );
});
await test("Trial, billing and operational organization cannot be deleted or reset by recreation", async () => {
  await as("root");
  const o = (await rpc("foundation_context")).organizations.find(
    (x) => x.id === orgs.A,
  );
  const n = await scalar("select count(*)::int from billing_subscriptions");
  assert.equal(
    (
      await rpc("access_delete_organization", {
        p_org: orgs.A,
        p_confirmation: o.name,
      })
    ).deleted,
    false,
  );
  assert.equal(
    await scalar("select count(*)::int from billing_subscriptions"),
    n,
  );
});
await test("Non-FK trial identifiers block deletion and fingerprints stay unchanged", async () => {
  const a = await create();
  await db.exec("reset role");
  await db.query(
    "insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref) values($1,'business',decode(repeat('ab',32),'hex'),$2,'fictional-verification')",
    [a.organization_id, users.root],
  );
  await as("root");
  assert.equal(
    (
      await rpc("access_delete_organization", {
        p_org: a.organization_id,
        p_confirmation: "Empresa Fictícia",
      })
    ).deleted,
    false,
  );
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from private.trial_identifiers where organization_id=$1",
      [a.organization_id],
    ),
    1,
  );
});
await test("Future tenant tables fail closed for deletion eligibility", async () => {
  const a = await create();
  await db.exec("reset role");
  await db.exec("create table private.future_history(organization_id uuid)");
  await db.query("insert into private.future_history values($1)", [
    a.organization_id,
  ]);
  await as("root");
  assert.equal(
    (
      await rpc("access_delete_organization", {
        p_org: a.organization_id,
        p_confirmation: "Empresa Fictícia",
      })
    ).deleted,
    false,
  );
});
await test("New private tables enforce RLS and FORCE RLS with no browser grants", async () => {
  await db.exec("reset role");
  const t = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where relname in ('organization_retention','organization_creation_requests','access_deliveries')",
    )
  ).rows;
  assert.equal(t.length, 3);
  assert(t.every((x) => x.relrowsecurity && x.relforcerowsecurity));
  await as("root");
  await deny(
    () => scalar("select count(*) from private.access_deliveries"),
    "permission denied",
  );
});
await test("Suspended organization cannot reserve a new account even through Super Admin RPC", async () => {
  const a = await create();
  await rpc("foundation_update_organization", {
    p_org: a.organization_id,
    p_name: "Empresa Fictícia",
    p_status: "suspended",
  });
  await deny(() => reserve(a.organization_id), "access_denied");
});
await writeFile(
  "reports/organization-activation-sql.json",
  JSON.stringify(results, null, 2),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
