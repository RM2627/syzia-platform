import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "../academy-067/fixture.mjs";
import { academyMailer } from "../../server/academy/mail.mjs";
import { acceptedDiagnostic } from "../../server/academy/mail-diagnostics.mjs";
import { httpsDiagnostic } from "../../server/academy/resend-diagnostics.mjs";
import { env, fakeHttps } from "./fake-https.mjs";
const noSMTP = () => {
  throw Error("Unexpected SMTP");
};
test("068 integrated local SQL, queue and administrative test", async (t) => {
  const c = await fixture();
  t.after(() => c.db.close());
  const historic = "b6b083ca-b733-4c20-a19e-cc247f36d4f6";
  await c.rawSQL(
    "insert into academy.deliveries(id,kind,token_expires,status,error_code,diagnostic)values($1,'confirm',now()+interval '1 day','uncertain','email_temporary_failure',$2)",
    [
      historic,
      {
        ...acceptedDiagnostic(),
        status: "uncertain",
        category: "uncertain",
        stage: "connection_or_socket",
        smtp_code: "ETIMEDOUT",
        error_code: "email_temporary_failure",
      },
    ],
  );
  const before = (
    await c.rawSQL(
      "select to_jsonb(d) v from academy.deliveries d where id=$1",
      [historic],
    )
  ).rows[0].v;
  await c.db.exec(
    await readFile(
      "supabase/migrations/202610310068_academy_https_diagnostics.sql",
      "utf8",
    ),
  );
  await t.test(
    "068 migration preserves histories, grants and old SMTP validation",
    async () => {
      assert.deepEqual(
        (
          await c.rawSQL(
            "select to_jsonb(d) v from academy.deliveries d where id=$1",
            [historic],
          )
        ).rows[0].v,
        before,
      );
      await c.rawSQL("select academy.check_mail_diagnostic($1)", [
        acceptedDiagnostic(),
      ]);
      await assert.rejects(
        c.rawSQL("select academy.check_mail_diagnostic($1)", [
          { ...acceptedDiagnostic(), secret: "must-not-persist" },
        ]),
        /academy_invalid/,
      );
      const grants = (
        await c.rawSQL(
          "select has_function_privilege('authenticated','academy.check_mail_diagnostic(jsonb)','EXECUTE') a,has_function_privilege('authenticated','public.academy_mail_service(text,jsonb)','EXECUTE') b,has_function_privilege('anon','public.academy_mail_admin(text,jsonb)','EXECUTE') c",
        )
      ).rows[0];
      assert.deepEqual(grants, { a: false, b: false, c: false });
    },
  );
  await t.test(
    "068 queue persists HTTPS acceptance/429/5xx independently, no uncertain reprocessing",
    async () => {
      await c.enable();
      for (const name of ["one", "two", "three"])
        await c.subscribe(name + "@example.invalid");
      const f = fakeHttps([
        {},
        { status: 429, body: { name: "rate_limit_exceeded" } },
        { status: 503, body: { name: "service_unavailable" } },
      ]);
      const ctrl = c.make({ send: academyMailer(env, noSMTP, f.options) });
      assert.equal((await ctrl.drain()).processed, 3);
      assert.equal(f.calls.length, 3);
      const rows = (
        await c.rawSQL(
          "select status,diagnostic from academy.deliveries where id<>$1 order by created_at",
          [historic],
        )
      ).rows;
      assert.deepEqual(
        rows.map((x) => x.status),
        ["accepted", "failed", "uncertain"],
      );
      assert.deepEqual(
        rows.map((x) => x.diagnostic.http_status),
        [200, 429, 503],
      );
      assert.ok(rows.every((x) => x.diagnostic.transport === "https_resend"));
      await ctrl.drain();
      assert.equal(f.calls.length, 3);
      assert.deepEqual(
        (
          await c.rawSQL(
            "select to_jsonb(d) v from academy.deliveries d where id=$1",
            [historic],
          )
        ).rows[0].v,
        before,
      );
      assert.doesNotMatch(
        JSON.stringify(c.logs),
        /example.invalid|re_local_simulation_only|token=/,
      );
    },
  );
  await t.test(
    "068 existing daily/monthly budgets leave new confirmations pending",
    async () => {
      await c.subscribe("pending@example.invalid");
      const f = fakeHttps();
      assert.equal(
        (
          await c
            .make({
              send: academyMailer(env, noSMTP, f.options),
              dailyLimit: 1,
            })
            .drain()
        ).processed,
        0,
      );
      assert.equal(
        (
          await c
            .make({
              send: academyMailer(env, noSMTP, f.options),
              monthlyLimit: 1,
            })
            .drain()
        ).processed,
        0,
      );
      assert.equal(f.calls.length, 0);
    },
  );
  await t.test(
    "068 active root preview/confirm, one HTTPS attempt, no subscription or launch effects",
    async () => {
      const count = async () =>
        (
          await c.rawSQL(
            "select (select count(*) from academy.students) students,(select count(*) from academy.deliveries) deliveries,(select count(*) from academy.campaigns) campaigns",
          )
        ).rows[0];
      const f = fakeHttps(),
        ctrl = c.make({ send: academyMailer(env, noSMTP, f.options) }),
        counts = await count();
      for (const user of ["", "anon", "adminA", "adminB"])
        await assert.rejects(
          ctrl.admin(
            "mail_test_preview",
            { email: "admin@example.invalid", authorized: true },
            user,
          ),
        );
      await assert.rejects(
        ctrl.admin(
          "mail_test_preview",
          { email: "admin@example.invalid" },
          "root",
        ),
        /confirmation_required/,
      );
      const p = await ctrl.admin(
        "mail_test_preview",
        { email: "admin@example.invalid", authorized: true },
        "root",
      );
      assert.equal(f.calls.length, 0);
      await assert.rejects(
        ctrl.admin("mail_test_confirm", { id: p.id }, "root"),
        /confirmation_required/,
      );
      await Promise.all([
        ctrl.admin("mail_test_confirm", { id: p.id, confirmed: true }, "root"),
        ctrl.admin("mail_test_confirm", { id: p.id, confirmed: true }, "root"),
      ]);
      await Promise.all([
        ctrl.processTest(p.id),
        c
          .make({ send: academyMailer(env, noSMTP, f.options) })
          .processTest(p.id),
      ]);
      assert.equal(f.calls.length, 1);
      assert.deepEqual(await count(), counts);
      assert.equal(
        JSON.parse(f.calls[0].writes[0]).subject,
        "SYZIA Academy — teste de envio",
      );
      const result = (await c.admin("overview")).mail_tests.find(
        (x) => x.id === p.id,
      );
      assert.equal(result.status, "accepted");
      assert.equal(result.diagnostic.http_status, 200);
      assert.equal(
        (
          await c.rawSQL(
            "select count(*) n from academy.deliveries where status='pending'",
          )
        ).rows[0].n,
        1,
      );
      await ctrl.processTest(p.id);
      assert.equal(f.calls.length, 1);
    },
  );
  await t.test(
    "068 strict HTTPS diagnostics reject secrets and false acceptance",
    async () => {
      const good = httpsDiagnostic({
        category: "accepted",
        stage: "accepted",
        error_code: "",
        http_status: 200,
        provider_id: "c890d935-2739-452b-b344-1c9d0d827d27",
      });
      await c.rawSQL("select academy.check_mail_diagnostic($1)", [good]);
      for (const d of [
        { ...good, email: "private@example.invalid" },
        { ...good, provider_id: "private@example.invalid" },
        { ...good, http_status: 500 },
        { ...good, provider_code: "private token" },
        { ...good, network_code: "unknown private code" },
      ])
        await assert.rejects(
          c.rawSQL("select academy.check_mail_diagnostic($1)", [d]),
          /academy_invalid/,
        );
    },
  );
});
