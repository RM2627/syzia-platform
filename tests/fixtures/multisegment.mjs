// Disposable PGlite demo only. Administrative service scenario; no clinical data.
import { randomUUID } from "node:crypto";
import { users } from "../support/consumer-db.mjs";
export async function seedMultisegment(c, plan) {
  const { db, as, scalar, rpc, orgs, save } = c;
  if (db.constructor.name !== "PGlite")
    throw Error("local_pglite_fixture_required");
  await db.exec("begin");
  try {
    users.adminC = "10000000-0000-0000-0000-000000000013";
    await db.query(
      "insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,now(),false)",
      [users.adminC],
    );
    await as("root");
    orgs.C = await scalar("select foundation_create_organization($1,$2,$3)", [
      "Clara Nutrição • Fictícia",
      "clara-nutricao-ficticia",
      users.adminC,
    ]);
    await as("adminC");
    await scalar("select company_initialize($1)", [orgs.C]);
    await scalar("select foundation_update_profile($1)", [
      "Clara • Profissional fictícia",
    ]);
    const rev = () =>
      scalar("select revision from company_settings where organization_id=$1", [
        orgs.C,
      ]);
    await save("C", "settings", {
      description:
        "Clara é uma nutricionista fictícia. Conheça os serviços e escolha um horário para atendimento. Esta página demonstra somente apresentação e organização administrativa.",
      service_regions: "Recife • atendimento presencial e online",
      payment_methods: "Pix e cartão",
      public_address: "Rua de Exemplo, 40 • endereço fictício",
      business_hours: Array.from({ length: 7 }, (_, day) => ({
        day,
        open: "08:00",
        close: "18:00",
      })),
      human_hours: [{ day: 1, open: "08:00", close: "18:00" }],
      exception_contact_name: "Responsável fictícia C",
      exception_contact: "administrativo@example.invalid",
    });
    await rpc("operations_support_mode", {
      p_org: orgs.C,
      p_mode: "own",
      p_revision: await rev(),
    });
    await save(
      "C",
      "rules",
      Object.fromEntries(
        [
          "pricing",
          "payment",
          "cancellation",
          "rescheduling",
          "service",
          "deadlines",
          "exception",
        ].map((k) => [
          k + "_policy",
          "Orientação administrativa fictícia. Confirmar condições com a responsável.",
        ]),
      ),
    );
    await save("C", "permissions", {
      allowed_actions: ["price_list"],
      never_change_price: true,
      max_discount_percent: 0,
      reviewed: true,
    });
    c.services.C = [
      await save("C", "service", {
        name: "Consulta de nutrição",
        category: "Consultas",
        description:
          "Atendimento com horário marcado. Escolha a modalidade e acompanhe a confirmação por aqui. Não envie informações clínicas neste formulário.",
        price_mode: "fixed",
        price_cents: 18000,
        duration_minutes: 60,
        direct_booking: true,
        quotes_allowed: true,
        availability: "Presencial ou online, conforme a modalidade escolhida.",
      }),
    ];
    await save("C", "field", {
      service_id: c.services.C[0],
      label: "Modalidade do atendimento",
      kind: "choice",
      options: ["Presencial", "Online"],
      required: true,
    });
    await save("C", "faq", {
      question: "Posso escolher atendimento online?",
      answer:
        "Sim. Selecione Online ao solicitar o horário. A comunicação aqui é somente administrativa.",
    });
    await save("C", "reply", {
      title: "Orientação administrativa",
      body: "Podemos ajudar com horários e informações do serviço. Este canal não recebe informações clínicas.",
    });
    c.manuals.C = await scalar("select company_create_manual($1,$2,$3)", [
      orgs.C,
      await rev(),
      "Informações administrativas fictícias",
    ]);
    for (const { id } of (
      await db.query(
        "select id from manual_sections where organization_id=$1",
        [orgs.C],
      )
    ).rows)
      await save(
        "C",
        "section",
        {
          content:
            "Orientações administrativas fictícias. Sem prontuário, diagnóstico ou registro clínico. Encaminhar dúvidas à responsável.",
        },
        id,
      );
    await scalar("select company_publish_manual($1,$2,$3)", [
      orgs.C,
      c.manuals.C,
      await rev(),
    ]);
    await rpc("consumer_branding_save", {
      p_org: orgs.C,
      p_revision: 0,
      p_data: {
        primary_color: "#563665",
        category_order: ["Consultas"],
        service_order: [],
      },
    });
    await rpc("consumer_publish_page", {
      p_org: orgs.C,
      p_manual: c.manuals.C,
      p_enabled: true,
      p_show_prices: true,
      p_expected_revision: 0,
    });
    // Deliberately no portfolio, no clinical intake, no patient record or profession entity.
    if (plan) {
      await as("root");
      await rpc("billing_trial_verify", {
        p_org: orgs.C,
        p_kind: "business",
        p_value: "ZZ:DEMO:COMPANYC",
        p_evidence: "fixture-local-C",
        p_reason: "Identidade totalmente fictícia para teste de versatilidade",
        p_verified: true,
      });
      await as("adminC");
      await rpc("billing_subscription_action", {
        p_org: orgs.C,
        p_action: "trial",
        p_plan: plan,
        p_revision: 0,
        p_key: randomUUID(),
      });
    }
    await db.exec("commit;reset role");
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
