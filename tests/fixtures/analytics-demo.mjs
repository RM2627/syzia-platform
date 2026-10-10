// LOCAL ONLY. Never run against a remote database. PGlite instance is provided by the demo.
// Business transitions use existing RPCs. Only fictional cohort dates, due dates and
// first inbound message times are seeded directly; immutable history is never rewritten.
import { randomUUID } from "node:crypto";
import { users } from "../support/consumer-db.mjs";
export async function seedAnalyticsDemo(c) {
  const { db, rpc, as, scalar, orgs, save } = c;
  if (db.constructor.name !== "PGlite")
    throw Error("local_pglite_fixture_required");
  await db.exec("begin");
  try {
    await as("adminB");
    await save("B", "settings", {
      description:
        "Um espaço para renovar o olhar. Consultoria de ambientes com escolhas conscientes, conforto e personalidade.",
      service_regions: "Recife e Olinda · consultoria online",
      public_address: "Atendimento com horário marcado",
    });
    for (const [i, id] of c.services.B.entries())
      await save(
        "B",
        "service",
        {
          name: [
            "Consultoria de ambientes",
            "Projeto de interiores",
            "Transformação completa",
          ][i],
          description: [
            "Um encontro para descobrir possibilidades, reorganizar seu espaço e encontrar novas ideias.",
            "Um projeto com materiais, cores e soluções pensadas para o seu dia a dia.",
            "Planejamento completo, do conceito aos detalhes. Converse com nosso estúdio.",
          ][i],
          category: ["Consultoria", "Projetos", "Personalizado"][i],
        },
        id,
      );
    for (const { id } of (
      await db.query(
        "select id from service_intake_fields where organization_id=$1",
        [orgs.B],
      )
    ).rows)
      await save(
        "B",
        "field",
        { label: "Qual ambiente você quer transformar?" },
        id,
      );
    for (const { id } of (
      await db.query("select id from service_addons where organization_id=$1", [
        orgs.B,
      ])
    ).rows)
      await save(
        "B",
        "addon",
        { name: "Painel de referências personalizado" },
        id,
      );
    for (const [i, { id }] of (
      await db.query(
        "select id from faqs where organization_id=$1 order by created_at,id",
        [orgs.B],
      )
    ).rows.entries())
      await save(
        "B",
        "faq",
        {
          question: i
            ? "O projeto pode ser online?"
            : "Como funciona a consultoria?",
          answer: i
            ? "Sim. Podemos conversar online sobre seu ambiente e suas referências."
            : "Começamos conhecendo o espaço e sua rotina. A proposta final é enviada para aprovação.",
        },
        id,
      );
    const rev = () =>
      scalar("select revision from company_settings where organization_id=$1", [
        orgs.B,
      ]);
    const mid = await scalar("select company_create_manual($1,$2,$3)", [
      orgs.B,
      await rev(),
      "Horizonte · demonstração",
    ]);
    await scalar("select company_publish_manual($1,$2,$3)", [
      orgs.B,
      mid,
      await rev(),
    ]);
    await scalar("select company_set_activation($1,$2,true,true)", [
      orgs.B,
      await rev(),
    ]);
    await rpc("consumer_publish_page", {
      p_org: orgs.B,
      p_manual: mid,
      p_enabled: true,
      p_show_prices: true,
      p_expected_revision: await scalar(
        "select revision from consumer_pages where organization_id=$1",
        [orgs.B],
      ),
    });
    await db.exec("reset role");
    await db.query(
      "insert into central_settings(organization_id,response_minutes) values($1,15),($2,30) on conflict(organization_id) do update set response_minutes=excluded.response_minutes",
      [orgs.A, orgs.B],
    );
    for (let i = 0; i < 24; i++) {
      const k = i < 20 ? "A" : "B",
        u = randomUUID();
      await db.exec("reset role");
      await db.query(
        "insert into auth.users(id,is_anonymous) values($1,true)",
        [u],
      );
      await as(u);
      const p = await rpc("consumer_public_page", {
          p_slug: k === "A" ? "ms-auto-ficticia" : "horizonte-ficticio",
        }),
        s = p.services.find(
          (s) => s.price_mode === ["fixed", "from", "quote"][i % 3],
        );
      const q = await rpc("consumer_create_request", {
        p_slug: p.slug,
        p_revision: p.revision,
        p_service: s.code,
        p_addons: [],
        p_answers: Object.fromEntries(
          s.questions.map((q) => [q.code, "Exemplo fictício"]),
        ),
        p_customer: {
          name:
            ["Lia", "Rafael", "Beatriz", "Caio", "Sofia", "Pedro"][i % 6] +
            " · Demo " +
            (i + 1),
          whatsapp: "8199900" + String(1000 + i),
          accepted_notice: true,
          notice_version: "consumer-v1",
        },
        p_notes: "Cenário fictício de demonstração",
        p_contact: true,
        p_expected_cents: s.price_cents,
        p_key: randomUUID(),
      });
      await rpc("consumer_set_source", {
        p_code: q.code,
        p_source: ["instagram", "google", "referral", "whatsapp", "direct"][
          i % 5
        ],
        p_detail: "",
      });
      // Older fictional interests with actual transitions occurring during this demo session.
      await db.exec("reset role");
      await db.query(
        "update quote_requests set created_at=now()-make_interval(days=>$2) where public_code=$1",
        [q.code, (i * 7) % 28],
      );
      await db.query(
        "update opportunities o set created_at=q.created_at from quote_requests q where q.opportunity_id=o.id and q.public_code=$1",
        [q.code],
      );
      await as(u);
      if (i % 7 === 6) continue;
      await rpc("consumer_submit_request", {
        p_code: q.code,
        p_attachment_count: 0,
        p_key: randomUUID(),
      });
      await rpc("central_consumer_send", {
        p_request: q.code,
        p_body: "Olá! Podemos conversar sobre este serviço?",
        p_key: randomUUID(),
      });
      const t = await rpc("central_consumer_thread", { p_request: q.code });
      await db.exec("reset role");
      const tid = await scalar("select id from tickets where public_code=$1", [
        t.code,
      ]);
      await db.query(
        "insert into ticket_messages(organization_id,ticket_id,author_id,author_name,kind,body,created_at) values($1,$2,$3,'Consumidor fictício','customer','Olá, gostaria de conhecer as opções.',now()-make_interval(mins=>$4))",
        [orgs[k], tid, u, 4 + (i % 5) * 7],
      );
      if (i % 4 !== 3) {
        await as("agent" + k);
        let tc = await rpc("central_context", { p_code: t.code });
        await rpc("central_act", {
          p_code: t.code,
          p_revision: tc.ticket.revision,
          p_action: "claim",
          p_data: {},
          p_key: randomUUID(),
        });
        tc = await rpc("central_context", { p_code: t.code });
        await rpc("central_act", {
          p_code: t.code,
          p_revision: tc.ticket.revision,
          p_action: "message",
          p_data: {
            body: "Olá! Vamos cuidar da sua solicitação. Este atendimento é fictício.",
          },
          p_key: randomUUID(),
        });
      }
      if (i % 6 === 5) continue;
      await as("admin" + k);
      let qc = await rpc("consumer_request_context", { p_code: q.code });
      await rpc("consumer_send_quote", {
        p_code: q.code,
        p_items: [
          { name: s.name, quantity: 1, unit_cents: s.price_cents || 58000 },
        ],
        p_duration: s.duration_minutes,
        p_expires: new Date(Date.now() + 7 * 86400000).toISOString(),
        p_expected_revision: qc.revision,
        p_key: randomUUID(),
      });
      await db.exec("reset role");
      const op = await scalar(
        "select commercial_code from commercial_opportunity_state s join quote_requests q on q.opportunity_id=s.id where q.public_code=$1",
        [q.code],
      );
      if (i % 3 === 0) {
        await db.query(
          "update commercial_tasks set due_at=now()-interval '10 minutes' where request_id=(select id from quote_requests where public_code=$1) and state not in ('completed','cancelled')",
          [q.code],
        );
        await as("agent" + k);
        for (const action of ["claim", "start", "result"]) {
          const ctx = await rpc("commercial_context", { p_code: op }),
            task = ctx.tasks.find(
              (t) => !["completed", "cancelled"].includes(t.state),
            );
          await rpc("commercial_task_act", {
            p_code: task.public_code,
            p_revision: task.revision,
            p_action: action,
            p_data:
              action === "result"
                ? { outcome: "responded", note: "Retorno fictício realizado" }
                : {},
            p_key: randomUUID(),
          });
        }
      }
      if (i % 5 === 4) {
        await as("admin" + k);
        const ctx = await rpc("commercial_context", { p_code: op });
        await rpc("commercial_op_act", {
          p_code: op,
          p_revision: ctx.revision,
          p_action: "lose",
          p_data: { reason: i % 2 ? "price" : "deadline" },
          p_key: randomUUID(),
        });
        continue;
      }
      if (i % 3 !== 1) {
        await as(u);
        qc = await rpc("consumer_request_context", { p_code: q.code });
        await rpc("consumer_approve_quote", {
          p_code: q.code,
          p_version: qc.current_version,
          p_key: randomUUID(),
        });
        if (i % 3 === 0) {
          const slots = await rpc("consumer_slots", {
            p_slug: p.slug,
            p_service: s.code,
            p_addons: [],
            p_day: new Date(Date.now() + (3 + i) * 86400000)
              .toISOString()
              .slice(0, 10),
          });
          if (slots.length)
            await rpc("consumer_book", {
              p_code: q.code,
              p_start: slots[0],
              p_previous: null,
              p_key: randomUUID(),
            });
        }
        await as("admin" + k);
        const tc = await rpc("central_context", { p_code: t.code });
        await rpc("central_act", {
          p_code: t.code,
          p_revision: tc.ticket.revision,
          p_action: "state",
          p_data: { state: "resolved" },
          p_key: randomUUID(),
        });
      }
    }
    await db.exec("commit;reset role");
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
