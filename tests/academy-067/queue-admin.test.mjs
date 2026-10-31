import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { acceptedDiagnostic } from "../../server/academy/mail-diagnostics.mjs";
const address = "authorized@example.invalid";
async function preview(c, controller = c.controller) {
  return controller.admin(
    "mail_test_preview",
    { email: address, authorized: true },
    "root",
  );
}
async function confirm(c, p, controller = c.controller) {
  return controller.admin(
    "mail_test_confirm",
    { id: p.id, confirmed: true },
    "root",
  );
}
async function counts(c) {
  return (
    await c.rawSQL(
      "select (select count(*) from academy.students) students,(select count(*) from academy.deliveries) deliveries,(select count(*) from academy.campaigns) campaigns",
    )
  ).rows[0];
}
test("067-Q database, administrative authorization, preview, isolation, concurrent confirmation and limits", async (t) => {
  const c = await fixture();
  t.after(() => c.db.close());
  await t.test("Migration is additive; RLS/FORCE and RPC grants", async () => {
    const r = (
      await c.rawSQL(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid='academy.mail_tests'::regclass",
      )
    ).rows[0];
    assert.deepEqual(r, { relrowsecurity: true, relforcerowsecurity: true });
    const p = (
      await c.rawSQL(
        "select has_function_privilege('anon','public.academy_mail_admin(text,jsonb)','EXECUTE') a,has_function_privilege('authenticated','public.academy_mail_service(text,jsonb)','EXECUTE') b",
      )
    ).rows[0];
    assert.deepEqual(p, { a: false, b: false });
    for (const u of ["adminA", "adminB"])
      await assert.rejects(
        c.controller.admin(
          "mail_test_preview",
          { email: address, authorized: true },
          u,
        ),
        /access_denied/,
      );
    await assert.rejects(
      c.controller.admin(
        "mail_test_preview",
        { email: address, authorized: true },
        "",
      ),
      /access_denied/,
    );
  });
  let p;
  const before = await counts(c);
  await t.test(
    "Explicit authorization and preview do not enqueue or send; encrypted recipient",
    async () => {
      await assert.rejects(
        c.controller.admin("mail_test_preview", { email: address }, "root"),
        /confirmation_required/,
      );
      await assert.rejects(
        c.controller.admin(
          "mail_test_preview",
          { email: "invalid", authorized: true },
          "root",
        ),
        /academy_invalid/,
      );
      p = await preview(c);
      assert.equal(p.recipient, address);
      assert.match(p.subject, /teste/);
      assert.equal(c.sent.length, 0);
      const row = (
        await c.rawSQL("select * from academy.mail_tests where id=$1", [p.id])
      ).rows[0];
      assert.equal(row.status, "preview");
      assert.doesNotMatch(JSON.stringify(row), /authorized@example/);
      assert.deepEqual(await counts(c), before);
    },
  );
  await t.test(
    "Confirmation required and idempotent across two requests/workers",
    async () => {
      await assert.rejects(
        c.controller.admin("mail_test_confirm", { id: p.id }, "root"),
        /confirmation_required/,
      );
      const results = await Promise.all([confirm(c, p), confirm(c, p)]);
      assert.equal(results[0].mail_test_id, results[1].mail_test_id);
      await Promise.all([
        c.controller.processTest(p.id),
        c.make().processTest(p.id),
      ]);
      assert.equal(c.sent.length, 1);
      assert.equal(c.sent[0].kind, "test");
      assert.deepEqual(await counts(c), before);
      await confirm(c, p);
      await c.controller.processTest(p.id);
      assert.equal(c.sent.length, 1);
      const row = (
        await c.rawSQL("select * from academy.mail_tests where id=$1", [p.id])
      ).rows[0];
      assert.equal(row.status, "accepted");
      assert.equal(row.payload, null);
      assert.doesNotMatch(
        JSON.stringify(c.logs),
        /authorized@example|token|password/,
      );
    },
  );
  await t.test("Expired previews and foreign/unknown IDs blocked", async () => {
    const expired = await preview(c);
    await c.rawSQL(
      "update academy.mail_tests set expires_at=now()-interval '1 second' where id=$1",
      [expired.id],
    );
    await assert.rejects(confirm(c, expired), /academy_preview_expired/);
    await assert.rejects(
      confirm(c, { id: "11111111-1111-4111-8111-111111111111" }),
      /access_denied/,
    );
  });
  await t.test(
    "Per-admin cap and global cap persist; pending tests never drain subscription queue",
    async () => {
      for (let i = 0; i < 2; i++) await confirm(c, await preview(c));
      await assert.rejects(
        confirm(c, await preview(c)),
        /academy_rate_limited/,
      );
      await c.controller.drain();
      assert.equal(c.sent.length, 1);
      await c.rawSQL(
        "update academy.mail_tests set authorized_at=now()-interval '2 hours' where authorized_at is not null",
      );
      await c.rawSQL(
        "insert into academy.mail_tests(actor,recipient_key,status,authorized_at) select gen_random_uuid(),repeat('b',64),'accepted',now() from generate_series(1,7)",
      );
      await assert.rejects(
        confirm(c, await preview(c)),
        /academy_rate_limited/,
      );
    },
  );
  await t.test(
    "Diagnostics allowlist rejects private fields; direct writes denied",
    async () => {
      const d = { ...acceptedDiagnostic(), email: address };
      await assert.rejects(
        c.service("mail_test_finish", {
          id: p.id,
          status: "accepted",
          error_code: "",
          diagnostic: d,
        }),
        /academy_invalid/,
      );
      await assert.rejects(
        c.tx("adminA", () => c.db.query("select * from academy.mail_tests")),
        /permission denied/,
      );
    },
  );
});
test("067-Q individual failures and persistence failure do not stop other confirmation mails; uncertain never retried", async (t) => {
  const c = await fixture();
  t.after(() => c.db.close());
  await c.enable();
  for (const a of ["one", "two", "three", "four"])
    await c.subscribe(a + "@example.invalid");
  let n = 0,
    finishes = 0;
  const attempts = [];
  const ctrl = c.make({
    send: async (v) => {
      attempts.push(v.delivery_id);
      n++;
      if (n === 1)
        throw Object.assign(Error("private data"), {
          code: "EAUTH",
          responseCode: 535,
          command: "AUTH",
        });
      if (n === 2)
        throw Object.assign(Error("Timeout"), {
          code: "ETIMEDOUT",
          command: "CONN",
        });
    },
    service: async (a, d) => {
      if (a === "delivery_finish" && ++finishes === 3)
        throw Error("private persistence data");
      return c.service(a, d);
    },
  });
  assert.equal((await ctrl.drain()).processed, 4);
  assert.equal(new Set(attempts).size, 4);
  const rows = (
    await c.rawSQL(
      "select status,diagnostic,payload from academy.deliveries order by created_at",
    )
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.status),
    ["failed", "uncertain", "sending", "accepted"],
  );
  assert.equal(rows[0].diagnostic.stage, "authentication");
  assert.equal(rows[1].diagnostic.category, "uncertain");
  await ctrl.drain();
  assert.equal(attempts.length, 4);
  assert.doesNotMatch(
    JSON.stringify(c.logs),
    /private data|private persistence|example.invalid/,
  );
  await c.rawSQL(
    "update academy.deliveries set attempted_at=now()-interval '3 minutes' where status='sending'",
  );
  await ctrl.drain();
  assert.equal(attempts.length, 4);
  assert.equal(
    (
      await c.rawSQL(
        "select count(*) n from academy.deliveries where status='uncertain'",
      )
    ).rows[0].n,
    2,
  );
});
test("067-Q test uncertain, disabled mode, stale recovery and active Super Admin required", async (t) => {
  const c = await fixture();
  t.after(() => c.db.close());
  const ctrl = c.make({
      send: async () => {
        throw Object.assign(Error("Timeout"), {
          code: "ETIMEDOUT",
          command: "CONN",
        });
      },
    }),
    p = await preview(c, ctrl);
  await confirm(c, p, ctrl);
  await ctrl.processTest(p.id);
  await ctrl.processTest(p.id);
  let overview = await c.admin("overview");
  assert.equal(
    overview.mail_tests.find((x) => x.id === p.id).status,
    "uncertain",
  );
  const q = await preview(c);
  await confirm(c, q);
  await c.service("mail_test_claim", { id: q.id });
  await c.rawSQL(
    "update academy.mail_tests set attempted_at=now()-interval '3 minutes' where id=$1",
    [q.id],
  );
  overview = await c.admin("overview");
  assert.equal(
    overview.mail_tests.find((x) => x.id === q.id).status,
    "uncertain",
  );
  await c.controller.processTest(q.id);
  assert.equal(c.sent.length, 0);
  await assert.rejects(
    preview(c, c.make({ mailEnabled: false })),
    /academy_mail_unavailable/,
  );
  // Existing root guard remains authoritative, including active profile/session checks.
  const allowed = (
    await c.rawSQL(
      "select pg_get_functiondef('academy.allowed()'::regprocedure) definition",
    )
  ).rows[0].definition;
  assert.match(allowed, /is_active_user/);
  await c.rawSQL("update public.profiles set status='suspended' where id=$1", [
    c.users.root,
  ]);
  await assert.rejects(preview(c), /access_denied/);
  await assert.rejects(c.admin("overview"), /access_denied/);
});

test("067-Q migration preserves an existing uncertain result without reclassification or retry", async (t) => {
  const id = "df1f73ab-e1c7-44c9-9d6c-02442af547b3";
  let before;
  const c = await fixture({
    beforeUpgrade: async (c) => {
      await c.rawSQL(
        "insert into academy.deliveries(id,kind,token_expires,status,error_code) values($1,'confirm',now()+interval '1 day','uncertain','email_temporary_failure')",
        [id],
      );
      before = (
        await c.rawSQL(
          "select to_jsonb(d) as v from academy.deliveries d where id=$1",
          [id],
        )
      ).rows[0].v;
    },
  });
  t.after(() => c.db.close());
  const row = (
    await c.rawSQL(
      "select to_jsonb(d) as v from academy.deliveries d where id=$1",
      [id],
    )
  ).rows[0].v;
  assert.deepEqual(row, { ...before, diagnostic: null });
  await c.controller.drain();
  assert.equal(c.sent.length, 0);
  const history = (await c.admin("overview")).deliveries.find(
    (d) => d.id === id,
  );
  assert.equal(history.status, "uncertain");
  assert.equal(history.diagnostic, null);
});
