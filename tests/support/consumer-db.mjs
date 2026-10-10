import pg from "pg";
import { PGlite } from "./pglite.mjs";
import { readFile, readdir } from "node:fs/promises";
export const users = Object.fromEntries(
  [
    "root",
    "adminA",
    "adminB",
    "alice",
    "bob",
    "charlie",
    "worker",
    "agentA",
    "backup",
    "agentB",
    "shared",
  ].map((n, i) => [
    n,
    `10000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
export async function consumerDB({ through = null } = {}) {
  const socket = process.env.FOUNDATION_NATIVE_SOCKET;
  if (socket && !socket.startsWith("/"))
    throw Error("Disposable local socket required");
  const client = socket
    ? new pg.Client({
        host: socket,
        user: "postgres",
        database: "foundation_phase2_test",
      })
    : null;
  if (client) await client.connect();
  const db = client
    ? {
        exec: (s) => client.query(s),
        query: (s, a) => client.query(s, a),
        close: () => client.end(),
      }
    : new PGlite();
  await db.exec(await readFile("tests/auth-fixture.sql", "utf8"));
  for (const f of (await readdir("supabase/migrations"))
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (!through || f <= through) &&
        !f.includes("0030_") &&
        !f.includes("0031_") &&
        !f.includes("0032_") &&
        !f.includes("0033_") &&
        !f.includes("0036_") &&
        !f.includes("0038_") &&
        !f.includes("0039_") &&
        !f.includes("0040_") &&
        !f.includes("0041_") &&
        !f.includes("0042_"),
    )
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const scalar = async (sql, args = []) =>
    Object.values((await db.query(sql, args)).rows[0])[0];
  async function as(name) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify(
        name === "anon"
          ? {}
          : {
              sub: users[name] || name,
              is_anonymous:
                ["alice", "bob", "charlie"].includes(name) ||
                name.startsWith("visitor_"),
            },
      ),
    ]);
    await db.exec(
      "set local role " + (name === "anon" ? "anon" : "authenticated"),
    );
  }
  for (const [n, id] of Object.entries(users))
    await db.query(
      "insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,$2,$3)",
      [
        id,
        ["alice", "bob", "charlie"].includes(n)
          ? null
          : new Date().toISOString(),
        ["alice", "bob", "charlie"].includes(n),
      ],
    );
  await db.query(
    "insert into platform_roles(user_id,role) values($1,'super_admin')",
    [users.root],
  );
  await db.exec("begin");
  await as("root");
  const orgs = {},
    services = {},
    manuals = {};
  for (const k of ["A", "B"]) {
    await as("root");
    orgs[k] = await scalar("select foundation_create_organization($1,$2,$3)", [
      k === "A" ? "MS Auto Details • Fictícia" : "Estúdio Horizonte",
      k === "A" ? "ms-auto-ficticia" : "horizonte-ficticio",
      users["admin" + k],
    ]);
    await as("admin" + k);
    await scalar("select company_initialize($1)", [orgs[k]]);
    await scalar(
      "select foundation_set_member($1,$2,'colaborador_empresa','active')",
      [orgs[k], users.worker],
    );
  }
  async function save(k, entity, data, id = null) {
    return scalar("select company_save($1,$2,$3,$4,$5)", [
      orgs[k],
      entity,
      id,
      await scalar(
        "select revision from company_settings where organization_id=$1",
        [orgs[k]],
      ),
      JSON.stringify(data),
    ]);
  }
  for (const k of ["A", "B"]) {
    await as("admin" + k);
    await save(k, "settings", {
      description:
        k === "A"
          ? "Cuidado em cada detalhe. Estética automotiva com tempo, técnica e atenção ao seu carro."
          : "Ambientes pensados para a sua rotina. Consultoria e projetos de interiores com atenção a cada detalhe.",
      service_regions: "Boa Viagem e região • Recife",
      payment_methods: "Pix, débito e crédito",
      public_address: k === "B" ? "Atendimento com horário marcado" : "Av. de Exemplo, 120 • endereço fictício",
      business_hours: Array.from({ length: 7 }, (_, day) => ({
        day,
        open: "08:00",
        close: "18:00",
      })),
      human_hours: [{ day: 1, open: "08:00", close: "18:00" }],
      exception_contact_name: "INTERNO SECRETO " + k,
      exception_contact: "privado@example.invalid",
    });
    await save(
      k,
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
        ].map((n) => [n + "_policy", "REGRA PRIVADA " + k]),
      ),
    );
    await save(k, "permissions", {
      allowed_actions: ["price_list"],
      never_change_price: true,
      max_discount_percent: 0,
      reviewed: true,
    });
    services[k] = [];
    for (const [i, mode] of ["fixed", "from", "quote"].entries())
      services[k].push(
        await save(k, "service", {
          name: [
            "Lavagem de cuidado",
            "Higienização interna",
            "Proteção e polimento",
          ][i],
          category: ["Essenciais", "Interior", "Proteção"][i],
          description: [
            "Limpeza cuidadosa da carroceria, rodas e acabamento interno. Seu carro bem cuidado para a próxima viagem.",
            "Renove o interior do seu carro com limpeza de bancos, carpetes e superfícies.",
            "Um plano de proteção pensado para a pintura e para a rotina do seu carro.",
          ][i],
          price_mode: mode,
          price_cents: mode === "quote" ? null : [12000, 35000][i],
          duration_minutes: [60, 120, 180][i],
          direct_booking: i === 0,
          notes: "OBSERVAÇÃO INTERNA " + k,
        }),
      );
    await save(k, "addon", {
      service_id: services[k][0],
      name: "Hidratação de bancos",
      price_mode: "fixed",
      price_cents: 4500,
      duration_minutes: 30,
    });
    await save(k, "field", {
      service_id: services[k][0],
      label: "Qual é o modelo do carro?",
      kind: "text",
      required: true,
    });
    await save(k, "faq", {
      question: "Preciso levar algum material?",
      answer: "Não. Os materiais necessários já estão incluídos no serviço.",
    });
    await save(k, "faq", {
      question: "O preço da higienização é definitivo?",
      answer:
        "É uma estimativa inicial. O valor final depende da avaliação e será enviado para sua aprovação.",
    });
    await save(k, "reply", {
      title: "Resposta interna",
      body: "NUNCA PUBLICAR ESTA RESPOSTA",
    });
    manuals[k] = await scalar("select company_create_manual($1,$2,$3)", [
      orgs[k],
      await scalar(
        "select revision from company_settings where organization_id=$1",
        [orgs[k]],
      ),
      "Manual fictício",
    ]);
    for (const { id } of (
      await db.query(
        "select id from manual_sections where organization_id=$1",
        [orgs[k]],
      )
    ).rows)
      await save(k, "section", { content: "MANUAL INTERNO SECRETO " + k }, id);
    await scalar("select company_publish_manual($1,$2,$3)", [
      orgs[k],
      manuals[k],
      await scalar(
        "select revision from company_settings where organization_id=$1",
        [orgs[k]],
      ),
    ]);
    await scalar("select consumer_publish_page($1,$2,true,true,0)", [
      orgs[k],
      manuals[k],
    ]);
  }
  await db.exec("commit;reset role");
  if (!through || through >= "202609210030_business_finance_permissions.sql")
    await db.exec(
      await readFile(
        "supabase/migrations/202609210030_business_finance_permissions.sql",
        "utf8",
      ),
    );
  async function rpc(name, args = {}) {
    if (
      !/^(acquisition|selfservice|people|permissions|financial|support|company|access|consumer|central|commercial|analytics|billing|operations|onboarding|foundation)_[a-z_]+$/.test(
        name,
      )
    )
      throw Error("Unknown RPC");
    const meta = (
      await db.query(
        "select proargnames,oid::regprocedure::text as signature from pg_proc where pronamespace='public'::regnamespace and proname=$1",
        [name],
      )
    ).rows[0];
    if (!meta) throw Error("Unknown RPC");
    return scalar(
      `select public.${name}(${(meta.proargnames || []).map((n, i) => `${n}=>$${i + 1}`).join(",")})`,
      (meta.proargnames || []).map((n) => {
        const v = args[n];
        return v && typeof v === "object" && !Array.isArray(v)
          ? JSON.stringify(v)
          : (v ?? null);
      }),
    );
  }
  if (!through || through >= "202609220031_public_presence_experience.sql")
    await db.exec(
      await readFile(
        "supabase/migrations/202609220031_public_presence_experience.sql",
        "utf8",
      ),
    );
  if (!through || through >= "202609220032_syzia_people_experience.sql")
    await db.exec(
      await readFile(
        "supabase/migrations/202609220032_syzia_people_experience.sql",
        "utf8",
      ),
    );
  if (!through || through >= "202609240033_acquisition_selfservice_finance.sql")
    await db.exec(
      await readFile(
        "supabase/migrations/202609240033_acquisition_selfservice_finance.sql",
        "utf8",
      ),
    );
  if (!through || through >= "202609250036_activation_links.sql")
    await db.exec(await readFile("supabase/migrations/202609250036_activation_links.sql", "utf8"));
  if (!through || through >= "202609250038_multiservice_requests.sql")
    await db.exec(await readFile("supabase/migrations/202609250038_multiservice_requests.sql", "utf8"));
  if (!through || through >= "202609250039_commercial_plans.sql")
    await db.exec(await readFile("supabase/migrations/202609250039_commercial_plans.sql", "utf8"));
  if (!through || through >= "202609260040_post_homologation.sql")
    await db.exec(await readFile("supabase/migrations/202609260040_post_homologation.sql", "utf8"));
  if (!through || through >= "202609260041_self_service_journeys.sql")
    await db.exec(await readFile("supabase/migrations/202609260041_self_service_journeys.sql", "utf8"));
  if (!through || through >= "202609260042_operational_refinements.sql")
    await db.exec(await readFile("supabase/migrations/202609260042_operational_refinements.sql", "utf8"));
  return { db, as, scalar, rpc, orgs, services, manuals, save };
}
