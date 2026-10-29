import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture.mjs";
import { subscriptions } from "../../server/billing/subscriptions.mjs";
import { inspectProductionPlans } from "../../server/billing/production-plans.mjs";
test("061 financial environment transition: historical mappings immutable, zero real provider calls", async (t) => {
  const c = await fixture();
  let configured, request;
  const config = (action, data = {}) =>
    c.service("billing061_configuration", { p_action: action, p_data: data });
  try {
    const before = (
      await c.rawSQL(
        "select to_jsonb(o) row from private.billing047_offers o order by code",
      )
    ).rows;
    await t.test(
      "owner attestations, reference and all six plans validated read-only",
      async () => {
        const calls = [];
        const entries = Object.entries(c.versions).map(
          ([code, source_version_id]) => ({
            code,
            source_version_id,
            trial_plan_id: code + "-trial-production",
            paid_plan_id: code + "-paid-production",
          }),
        );
        const gateway = {
          collectorId: "101",
          applicationId: "202",
          plan: async (id, offer, trial) => {
            calls.push(id);
            return {
              external_reference: `SYZIA-${offer.code.toUpperCase()}-${trial ? "TRIAL" : "PAGO"}`,
            };
          },
        };
        await assert.rejects(
          inspectProductionPlans(entries, {
            gateway,
            environment: "production",
          }),
          /confirmation/,
        );
        const validated = await inspectProductionPlans(entries, {
          gateway,
          environment: "production",
          accountConfirmed: true,
        });
        assert.equal(calls.length, 6);
        const pf = await config("preflight");
        request = {
          environment: "production",
          account_confirmed: true,
          provider_validated: true,
          expected_legacy_sha256: pf.legacy_mapping_sha256,
          batch_id: randomUUID(),
          entries: validated.entries,
        };
        await assert.rejects(
          config("configure", { ...request, account_confirmed: false }),
          /precondition/,
        );
        await assert.rejects(
          config("configure", { ...request, account_confirmed: null }),
          /precondition/,
        );
        const reused = structuredClone(request);
        reused.entries[0].trial_plan_id = reused.entries[0].code + "-trial";
        await assert.rejects(config("configure", reused), /reuse_forbidden/);
      },
    );
    await t.test(
      "transaction rollback if a later plan is invalid",
      async () => {
        const bad = structuredClone(request);
        bad.entries[2].source_version_id = randomUUID();
        await assert.rejects(config("configure", bad), /unavailable/);
        assert.equal((await config("preflight")).environment, "legacy");
        assert.deepEqual(
          (
            await c.rawSQL(
              "select to_jsonb(o) row from private.billing047_offers o order by code",
            )
          ).rows,
          before,
        );
      },
    );
    await t.test(
      "new versions atomic and idempotent; legacy mappings and prices preserved",
      async () => {
        configured = await config("configure", request);
        assert.equal(configured.length, 3);
        assert.deepEqual(await config("configure", request), configured);
        assert.deepEqual(
          (
            await c.rawSQL(
              "select to_jsonb(o) row from private.billing047_offers o order by code",
            )
          ).rows,
          before,
        );
        const view = await c.view();
        assert.equal(view.catalog.length, 3);
        assert.ok(
          view.catalog.every((v) =>
            configured.some((x) => x.plan_version_id === v.version_id),
          ),
        );
        assert.deepEqual(
          view.catalog.map((x) => x.price_cents),
          [4990, 8990, 14990],
        );
        await assert.rejects(
          c.service("billing047_service", {
            p_action: "list",
            p_id: null,
            p_data: {},
          }),
          /environment_mismatch/,
        );
      },
    );
    const engine = () =>
      subscriptions({
        gateway: c.gateway,
        service: c.service,
        asUser: c.asUser,
        auth: async (name) => ({
          id: c.users[name],
          email: name + "@example.invalid",
        }),
        environment: "production",
      });
    await t.test(
      "production trial uses new mapping and existing engine; no duplicate subscription",
      async () => {
        const id = configured.find(
          (x) => x.code === "essencial",
        ).plan_version_id;
        const body = {
          organization_id: c.orgs.A,
          action: "checkout",
          request_key: randomUUID(),
          trial_expected: true,
          payer_email: "pagador@example.invalid",
          plan_version_id: id,
          card_token: "offline-token-for-tests-only",
        };
        const r = await engine().user("command", body, "adminA");
        assert.equal(r.subscription.state, "trialing");
        await engine().user("command", body, "adminA");
        assert.equal(
          c.fake.calls.filter(
            (x) => x.method === "POST" && x.path === "/preapproval",
          ).length,
          1,
        );
        const contract = (
          await c.rawSQL(
            "select provider_environment,mapping_id,trial_reserved from private.billing047_contracts where organization_id=$1",
            [c.orgs.A],
          )
        ).rows[0];
        assert.equal(contract.provider_environment, "production");
        assert.ok(contract.mapping_id && contract.trial_reserved);
      },
    );
    await t.test(
      "unbound event IDs are queued and never fetched under production credentials",
      async () => {
        const before = c.fake.calls.length;
        const result = await engine().webhook(
          Buffer.from(
            JSON.stringify({
              type: "payment",
              data: { id: "legacy-payment-id" },
            }),
          ),
          {},
          new URLSearchParams(),
        );
        assert.equal(result.reconciliation_pending, true);
        assert.equal(c.fake.calls.length, before);
        await engine().webhook(
          Buffer.from(
            JSON.stringify({
              type: "payment",
              data: { id: "legacy-payment-id" },
            }),
          ),
          {},
          new URLSearchParams(),
        );
        assert.equal(
          (
            await c.rawSQL(
              "select count(*)::int n from private.billing061_notifications",
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "runtime merchant mismatch rejected before provider I/O",
      async () => {
        const calls = c.fake.calls.length;
        await assert.rejects(
          c.service("billing047_service", {
            p_action: "list",
            p_id: null,
            p_data: {
              environment: "production",
              runtime_collector_id: "999",
              runtime_application_id: "202",
            },
          }),
          /identity_mismatch/,
        );
        assert.equal(c.fake.calls.length, calls);
      },
    );
    await t.test(
      "reconciliation selects only matching environment",
      async () => {
        assert.equal((await engine().reconcile()).inspected, 1);
        await assert.rejects(
          c.rawSQL(
            "update private.billing047_contracts set provider_environment='sandbox'where organization_id=$1",
            [c.orgs.A],
          ),
          /immutable/,
        );
      },
    );
    await t.test(
      "production upgrade waits for payment; downgrade waits for cycle and cancel/resume preserve access boundary",
      async () => {
        const sub = (await c.view()).subscription,
          provider = [...c.fake.subscriptions.values()][0];
        const cmd = (action, code) =>
          engine().user(
            "command",
            {
              organization_id: c.orgs.A,
              action,
              request_key: randomUUID(),
              ...(code
                ? {
                    plan_version_id: configured.find((x) => x.code === code)
                      .plan_version_id,
                  }
                : {}),
            },
            "adminA",
          );
        assert.equal(
          (await cmd("change", "profissional")).subscription.code,
          "essencial",
        );
        await c.rawSQL(
          "update private.billing047_contracts set target_effective_at=now()-interval '1 minute',target_requested_at=now()-interval '2 minutes'where id=$1",
          [sub.id],
        );
        c.fake.charge(provider.id);
        await engine().process(sub.id);
        assert.equal((await c.view()).subscription.code, "profissional");
        assert.equal(
          (await cmd("change", "essencial")).subscription.code,
          "profissional",
        );
        await c.rawSQL(
          "update private.billing047_contracts set target_effective_at=now()-interval '1 minute',target_requested_at=now()-interval '2 minutes'where id=$1",
          [sub.id],
        );
        c.fake.charge(provider.id);
        await engine().process(sub.id);
        assert.equal((await c.view()).subscription.code, "essencial");
        assert.equal(
          (await cmd("cancel")).subscription.state,
          "cancel_scheduled",
        );
        await cmd("resume");
        assert.equal((await c.view()).subscription.state, "active");
        const data = Buffer.from(
          JSON.stringify({
            type: "subscription_preapproval",
            data: { id: provider.id },
          }),
        );
        await engine().webhook(data, {}, new URLSearchParams());
        await engine().webhook(data, {}, new URLSearchParams());
        assert.equal(c.fake.subscriptions.size, 1);
      },
    );
    await t.test(
      "production definitive failure can retry; uncertain create reconciles without duplicate or renewed trial",
      async () => {
        const command = () =>
          engine().user(
            "command",
            {
              organization_id: c.orgs.B,
              action: "checkout",
              request_key: randomUUID(),
              trial_expected: true,
              payer_email: "comprador@example.invalid",
              plan_version_id: configured.find((x) => x.code === "equipe")
                .plan_version_id,
              card_token: "offline-card-token-for-test-only",
            },
            "adminB",
          );
        const transport = c.gateway.fetchImpl;
        c.gateway.fetchImpl = async (url, init) =>
          new URL(url).pathname === "/preapproval" && init.method === "POST"
            ? new Response("{}", { status: 400 })
            : transport(url, init);
        await assert.rejects(command(), /invalid_request/);
        let sub = (await c.view("B")).subscription;
        assert.equal(
          (
            await c.asUser("adminB", "billing_capabilities", {
              p_org: c.orgs.B,
            })
          ).software,
          false,
        );
        c.gateway.fetchImpl = async (url, init) => {
          const r = await transport(url, init);
          if (
            new URL(url).pathname === "/preapproval" &&
            init.method === "POST"
          )
            throw Error("lost-response");
          return r;
        };
        await assert.rejects(command(), /unavailable/);
        assert.equal(c.fake.subscriptions.size, 2);
        c.gateway.fetchImpl = transport;
        await engine().process(sub.id);
        assert.equal((await c.view("B")).subscription.state, "trialing");
        assert.equal(c.fake.subscriptions.size, 2);
        assert.equal(
          (
            await c.rawSQL(
              "select trial_reserved from private.billing047_contracts where id=$1",
              [sub.id],
            )
          ).rows[0].trial_reserved,
          true,
        );
      },
    );
  } finally {
    await c.db.close();
  }
});
test("061 legacy canceled contract remains historical; production never reconciles it", async () => {
  const c = await fixture();
  try {
    const initial = await c.command();
    const id = initial.subscription.id;
    await c.command("cancel");
    const legacy = (
      await c.rawSQL("select *from private.billing047_contracts where id=$1", [
        id,
      ])
    ).rows[0];
    const p = c.fake.subscriptions.get(legacy.provider_id);
    p.status = "cancelled";
    p.version++;
    p.last_modified = new Date(Date.now() + 1000).toISOString();
    await c.engine.process(id);
    const before = (
      await c.rawSQL(
        "select to_jsonb(c) r from private.billing047_contracts c where id=$1",
        [id],
      )
    ).rows[0].r;
    assert.equal(before.provider_state, "canceled");
    assert.equal(before.state, "cancel_scheduled");
    assert.equal(before.trial_reserved, true);
    const pre = await c.service("billing061_configuration", {
      p_action: "preflight",
      p_data: {},
    });
    assert.equal(Number(pre.blocking_contracts), 0);
    await c.service("billing061_configuration", {
      p_action: "configure",
      p_data: {
        environment: "production",
        account_confirmed: true,
        provider_validated: true,
        expected_legacy_sha256: pre.legacy_mapping_sha256,
        batch_id: randomUUID(),
        entries: Object.entries(c.versions).map(
          ([code, source_version_id]) => ({
            code,
            source_version_id,
            trial_plan_id: code + "-trial-production",
            paid_plan_id: code + "-paid-production",
            collector_id: "101",
            application_id: "202",
          }),
        ),
      },
    });
    const engine = subscriptions({
      gateway: c.gateway,
      service: c.service,
      asUser: c.asUser,
      auth: async (name) => ({
        id: c.users[name],
        email: name + "@example.invalid",
      }),
      environment: "production",
    });
    const count = c.fake.calls.length;
    await assert.rejects(engine.process(id), /environment_mismatch/);
    assert.equal((await engine.reconcile()).inspected, 0);
    assert.equal(c.fake.calls.length, count);
    assert.deepEqual(
      (
        await c.rawSQL(
          "select to_jsonb(c) r from private.billing047_contracts c where id=$1",
          [id],
        )
      ).rows[0].r,
      before,
    );
    assert.ok(
      Number(
        (
          await c.rawSQL(
            "select count(*) n from private.billing047_trial_reservations where contract_id=$1",
            [id],
          )
        ).rows[0].n,
      ) > 0,
    );

    // Local time simulation only: preserve the existing paid/trial-end rule.
    await c.rawSQL(
      "update private.billing047_contracts set trial_end=now()-interval '1 minute'where id=$1",
      [id],
    );
    const offers = (await c.view()).catalog;
    const next = {
      organization_id: c.orgs.A,
      action: "checkout",
      plan_version_id: offers.find((x) => x.code === "essencial").version_id,
      request_key: randomUUID(),
      trial_expected: true,
      payer_email: "pagador@example.invalid",
      card_token: "offline-card-token-for-test-only",
    };
    await assert.rejects(
      engine.user("command", next, "adminA"),
      /billing_trial_changed/,
    );
    const paid = await engine.user(
      "command",
      { ...next, request_key: randomUUID(), trial_expected: false },
      "adminA",
    );
    assert.notEqual(paid.subscription.id, id);
    assert.equal(paid.subscription.state, "payment_pending");
    assert.equal(
      (await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A }))
        .software,
      false,
    );
    const provider = [...c.fake.subscriptions.values()].find(
      (x) => x.external_reference === paid.subscription.id,
    );
    assert.match(provider.preapproval_plan_id, /paid-production$/);
    c.fake.charge(provider.id);
    await engine.process(paid.subscription.id);
    assert.equal((await c.view()).subscription.state, "active");
  } finally {
    await c.db.close();
  }
});
