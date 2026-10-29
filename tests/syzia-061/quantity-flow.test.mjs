import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture.mjs";
test("061 quantity: actual configurator → publication → request → original history", async (t) => {
  const c = await fixture();
  try {
    const page = await c.asUser("anon", "consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    });
    const original = page.services.find((s) => s.price_mode === "fixed");
    assert.ok(original);
    const service = (
      await c.rawSQL(
        "select id from public.services where organization_id=$1 and private.consumer_code('s',id)=$2",
        [c.orgs.A, original.code],
      )
    ).rows[0].id;
    const revision = async () =>
      Number(
        (
          await c.rawSQL(
            "select revision from public.company_settings where organization_id=$1",
            [c.orgs.A],
          )
        ).rows[0].revision,
      );
    await c.asUser("adminA", "company_save", {
      p_org: c.orgs.A,
      p_entity: "service",
      p_id: service,
      p_expected_revision: await revision(),
      p_data: {
        quantity_enabled: true,
        quantity_min: 1,
        quantity_max: 5,
        quantity_unit: "peça",
        quantity_duration: "proportional",
        contract_mode: "immediate",
        duration_minutes: 60,
      },
    });
    const draft = await c.asUser("adminA", "consumer_page_draft", {
      p_org: c.orgs.A,
      p_show_prices: true,
    });
    await c.asUser("adminA", "consumer_publish_draft", {
      p_org: c.orgs.A,
      p_token: draft.token,
      p_show_prices: true,
      p_expected_revision: draft.page_revision,
    });
    const published = await c.asUser("anon", "consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    });
    const s = published.services.find((x) => x.code === original.code);
    assert.equal(s.quantity_max, 5);
    const items = [
      {
        service: s.code,
        quantity: 3,
        addons: [],
        answers: Object.fromEntries(
          s.questions.map((q) => [q.code, "Dados fictícios"]),
        ),
        notes: "",
      },
    ];
    const args = {
      p_slug: published.slug,
      p_revision: published.revision,
      p_items: items,
      p_customer: {
        name: "Pessoa Exemplo",
        whatsapp: "81999990000",
        email: null,
        accepted_notice: true,
        notice_version: "consumer-v1",
      },
      p_notes: "",
      p_contact: false,
      p_expected_cents: s.price_cents * 3,
      p_key: randomUUID(),
    };
    const q = await c.asUser("alice", "consumer_create_multi_request", args);
    assert.equal(
      (await c.asUser("alice", "consumer_create_multi_request", args)).code,
      q.code,
    );
    const originalRow = (
      await c.rawSQL(
        "select requested_items,publication_id from public.quote_requests where public_code=$1",
        [q.code],
      )
    ).rows[0];
    assert.equal(originalRow.requested_items[0].quantity, 3);
    const calc = (
      await c.rawSQL(
        "select private.consumer_request_selection(q) r from public.quote_requests q where public_code=$1",
        [q.code],
      )
    ).rows[0].r;
    assert.equal(calc.duration_minutes, 180);
    assert.equal(calc.total_cents, s.price_cents * 3);
    assert.equal(calc.items[0].quantity, 3);
    assert.equal(
      (
        await c.rawSQL(
          "select qi.quantity from public.quote_items qi join public.quote_versions v on v.id=qi.version_id join public.quote_requests q on q.id=v.request_id where q.public_code=$1 and qi.position=0",
          [q.code],
        )
      ).rows[0].quantity,
      3,
    );
    await assert.rejects(
      c.asUser("alice", "consumer_create_multi_request", {
        ...args,
        p_key: randomUUID(),
        p_expected_cents: 1,
      }),
      /price|changed|mismatch/,
    );
    await assert.rejects(
      c.asUser("alice", "consumer_create_multi_request", {
        ...args,
        p_key: randomUUID(),
        p_items: [{ ...items[0], quantity: 6 }],
      }),
      /quantity/,
    );
    await assert.rejects(
      c.asUser("adminB", "company_save", {
        p_org: c.orgs.A,
        p_entity: "service",
        p_id: service,
        p_expected_revision: await revision(),
        p_data: { quantity_max: 999 },
      }),
      /denied|permission/,
    );
    const options = await c.asUser("alice", "consumer_journey_options", {
      p_slug: published.slug,
      p_revision: published.revision,
      p_items: items,
      p_day: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      p_next: true,
    });
    assert.equal(options.duration_minutes, 180);
    assert.equal(options.journey, "direct");
    assert.ok(options.plans.length);
    const first = options.plans[0];
    await assert.rejects(
      c.asUser("alice", "consumer_complete_execution", {
        p_code: q.code,
        p_start: first.start,
        p_periods: first.periods.map((x) => ({ ...x, minutes: 60 })),
        p_attachment_count: 0,
        p_key: randomUUID(),
      }),
      /execution_plan_changed/,
    );
    assert.equal(
      Number(
        (
          await c.rawSQL(
            "select count(*) n from public.appointments where request_id=(select id from public.quote_requests where public_code=$1)",
            [q.code],
          )
        ).rows[0].n,
      ),
      0,
    );
    await c.asUser("alice", "consumer_complete_execution", {
      p_code: q.code,
      p_start: first.start,
      p_periods: first.periods,
      p_attachment_count: 0,
      p_key: randomUUID(),
    });
    const scheduled = (
      await c.rawSQL(
        "select sum(extract(epoch from(ends_at-starts_at))/60)::int minutes from public.appointments where request_id=(select id from public.quote_requests where public_code=$1)and state='confirmed'",
        [q.code],
      )
    ).rows[0];
    assert.equal(scheduled.minutes, 180);
    await assert.rejects(
      c.rawSQL(
        "update public.quote_requests set requested_items='[]'where public_code=$1",
        [q.code],
      ),
      /immutable/,
    );
    await c.asUser("adminA", "company_save", {
      p_org: c.orgs.A,
      p_entity: "service",
      p_id: service,
      p_expected_revision: await revision(),
      p_data: { quantity_min: 2, quantity_duration: "manual" },
    });
    const later = await c.asUser("adminA", "consumer_page_draft", {
      p_org: c.orgs.A,
      p_show_prices: true,
    });
    await c.asUser("adminA", "consumer_publish_draft", {
      p_org: c.orgs.A,
      p_token: later.token,
      p_show_prices: true,
      p_expected_revision: later.page_revision,
    });
    const latest = await c.asUser("anon", "consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    });
    await assert.rejects(
      c.asUser("alice", "consumer_create_request", {
        p_slug: latest.slug,
        p_revision: latest.revision,
        p_service: s.code,
        p_addons: [],
        p_answers: items[0].answers,
        p_customer: args.p_customer,
        p_notes: "",
        p_contact: false,
        p_expected_cents: s.price_cents,
        p_key: randomUUID(),
      }),
      /quantity_out_of_range/,
    );
    // Re-publication cannot rewrite the existing request's proportional duration.
    assert.equal(
      (
        await c.rawSQL(
          "select private.consumer_request_selection(q) r from public.quote_requests q where public_code=$1",
          [q.code],
        )
      ).rows[0].r.duration_minutes,
      180,
    );
    const manualItems = [{ ...items[0], quantity: 2 }];
    const reviewed = await c.asUser("alice", "consumer_create_multi_request", {
      ...args,
      p_revision: latest.revision,
      p_items: manualItems,
      p_expected_cents: s.price_cents * 2,
      p_key: randomUUID(),
    });
    const times = await c.asUser("alice", "consumer_journey_options", {
      p_slug: latest.slug,
      p_revision: latest.revision,
      p_items: manualItems,
      p_day: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      p_next: true,
    });
    const submitted = await c.asUser("alice", "consumer_complete_execution", {
      p_code: reviewed.code,
      p_start: times.plans[0].start,
      p_periods: times.plans[0].periods,
      p_attachment_count: 0,
      p_key: randomUUID(),
    });
    assert.notEqual(submitted.journey, "direct");
    const context = await c.asUser("adminA", "operations_quote_context", {
      p_org: c.orgs.A,
      p_code: reviewed.code,
    });
    const proposedItems = [
      {
        kind: "original",
        position: 0,
        quantity: 4,
        unit_cents: s.price_cents,
        duration_minutes: 90,
        discount_cents: 0,
        note: "Quantidade ajustada após avaliação.",
      },
    ];
    const proposal = await c.asUser(
      "adminA",
      "operations_send_calculated_quote",
      {
        p_org: c.orgs.A,
        p_code: reviewed.code,
        p_items: proposedItems,
        p_discount: { mode: "none", value: 0 },
        p_expires: new Date(Date.now() + 7 * 86400000).toISOString(),
        p_expected_revision: context.revision,
        p_explanation:
          "Quatro peças e duração total confirmadas após avaliação.",
        p_key: randomUUID(),
      },
    );
    assert.equal(proposal.total_cents, s.price_cents * 4);
    const approval = await c.asUser("alice", "consumer_approve_quote", {
      p_code: reviewed.code,
      p_version: proposal.code,
      p_key: randomUUID(),
    });
    assert.equal(approval.state, "approved");
    const accepted = (
      await c.rawSQL(
        "select v.duration_minutes,qi.quantity from public.quote_versions v join public.quote_items qi on qi.version_id=v.id where v.public_code=$1 and qi.position=0",
        [proposal.code],
      )
    ).rows[0];
    assert.equal(accepted.quantity, 4);
    assert.equal(accepted.duration_minutes, 90);
    // Approval is distinct from scheduling; choose/confirm the final 90-minute plan.
    const finalTimes = await c.asUser("alice", "consumer_execution_options", {
      p_code: reviewed.code,
      p_day: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      p_next: true,
    });
    await c.asUser("alice", "consumer_book_execution", {
      p_code: reviewed.code,
      p_start: finalTimes.plans[0].start,
      p_previous: null,
      p_periods: finalTimes.plans[0].periods,
      p_key: randomUUID(),
    });
    const reviewedSchedule = (
      await c.rawSQL(
        "select sum(service_minutes)::int minutes from public.appointments where request_id=(select id from public.quote_requests where public_code=$1)and state='confirmed'",
        [reviewed.code],
      )
    ).rows[0];
    assert.equal(reviewedSchedule.minutes, 90);
  } finally {
    await c.db.close();
  }
});
