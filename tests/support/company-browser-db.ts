import { upgrade030Fixture } from "./upgrade030.mjs";
import { PGlite } from "./pglite.mjs";
import { readFile, readdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
export const admin = "00000000-0000-0000-0000-000000000002",
  root = "00000000-0000-0000-0000-000000000001",
  attendant = "00000000-0000-0000-0000-000000000004";
export async function setupCompany(
  page: Page,
  role: "admin" | "attendant" = "admin",
) {
  const db = new PGlite();
  await db.exec(await readFile("tests/auth-fixture.sql", "utf8"));
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => !f.includes("0030_"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  const adminB = "00000000-0000-0000-0000-000000000003";
  for (const id of [root, admin, adminB, attendant])
    await db.query(
      "insert into auth.users(id,email_confirmed_at) values($1,now())",
      [id],
    );
  await db.query(
    "insert into platform_roles(user_id,role) values($1,'super_admin'),($2,'atendente')",
    [root, attendant],
  );
  async function as(id: string) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: id, is_anonymous: false }),
    ]);
    await db.exec("set local role authenticated");
  }
  async function scalar(q: string, args: unknown[] = []): Promise<any> {
    return Object.values((await db.query(q, args)).rows[0] as object)[0];
  }
  await db.exec("begin");
  await as(root);
  const A = await scalar(
    "select foundation_create_organization('Oficina Aurora Fictícia','aurora-ficticia',$1)",
    [admin],
  );
  const B = await scalar(
    "select foundation_create_organization('Estúdio Horizonte Fictício','horizonte-ficticio',$1)",
    [adminB],
  );
  await db.query("select foundation_set_attendant($1,$2,'primary','active')", [
    A,
    attendant,
  ]);
  await as(admin);
  await db.query("select company_initialize($1)", [A]);
  await as(adminB);
  await db.query("select company_initialize($1)", [B]);
  await as(admin);
  async function rev() {
    return scalar(
      "select revision from company_settings where organization_id=$1",
      [A],
    );
  }
  async function save(entity: string, data: object, id: string | null = null) {
    return scalar("select company_save($1,$2,$3,$4,$5)", [
      A,
      entity,
      id,
      await rev(),
      JSON.stringify(data),
    ]);
  }
  await save("settings", {
    description: "Atendimento fictício de serviços locais.",
    service_regions: "Bairro fictício",
    payment_methods: "Pix e cartão fictícios",
    business_hours: [{ day: 1, open: "08:00", close: "18:00" }],
    human_hours: [{ day: 1, open: "09:00", close: "17:00" }],
    exception_contact_name: "Responsável interno fictício",
    exception_contact: "interno@example.invalid",
  });
  await save(
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
        "Condições fictícias para desenvolvimento local.",
      ]),
    ),
  );
  await save("permissions", {
    allowed_actions: ["price_list"],
    never_change_price: true,
    max_discount_percent: 0,
    reviewed: true,
  });
  const service = await save("service", {
    name: "Limpeza técnica fictícia",
    price_mode: "fixed",
    price_cents: 12000,
    duration_minutes: 60,
  });
  await save("faq", {
    question: "Quais regiões são atendidas?",
    answer: "Atendemos somente o bairro fictício.",
  });
  await save("reply", {
    title: "Saudação inicial",
    body: "Olá! Consulte nossos serviços fictícios.",
  });
  const manual = await scalar("select company_create_manual($1,$2,$3)", [
    A,
    await rev(),
    "Manual fictício de atendimento",
  ]);
  for (const { id } of (
    await db.query<{ id: string }>(
      "select id from manual_sections where organization_id=$1",
      [A],
    )
  ).rows)
    await save(
      "section",
      { content: "Orientação fictícia aprovada para a equipe de atendimento." },
      id,
    );
  await db.exec("commit; reset role");
  await upgrade030Fixture(db, [A, B]);
  let queue: Promise<unknown> = Promise.resolve();
  const calls: { name: string; body: any }[] = [];
  let currentUser = role === "admin" ? admin : attendant;
  const user = () => ({
    id: currentUser,
    aud: "authenticated",
    role: "authenticated",
    email: "pessoa@example.invalid",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  });
  const token = () =>
    [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: currentUser,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url"),
      "local-test-signature",
    ].join(".");
  const signature: Record<string, string[]> = {
    permissions_context: ["p_org"],
    company_categories: ["p_org"],
    company_category_save: ["p_org", "p_id", "p_revision", "p_data", "p_key"],
    foundation_context: [],
    access_session: ["p_activity", "p_logout"],
    onboarding_context: ["p_org"],
    onboarding_act: ["p_org", "p_action", "p_revision", "p_key"],
    operations_support_mode: ["p_org", "p_mode", "p_revision"],
    company_initialize: ["p_org"],
    company_context: ["p_org"],
    company_readiness: ["p_org"],
    company_save: [
      "p_org",
      "p_entity",
      "p_id",
      "p_expected_revision",
      "p_data",
    ],
    company_create_manual: ["p_org", "p_expected_revision", "p_title"],
    company_discard_manual: ["p_org", "p_manual", "p_expected_revision"],
    company_publish_manual: ["p_org", "p_manual", "p_expected_revision"],
    company_set_activation: [
      "p_org",
      "p_expected_revision",
      "p_human",
      "p_public_faq",
    ],
    company_public_faq: ["p_slug"],
  };
  function serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  }
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : {};
    let data: any = {},
      status = 200;
    if (path === "/access/global-login")
      data = {
        session: { access_token: token(), refresh_token: "fake-local-refresh" },
      };
    else if (path === "/auth/v1/token")
      data = {
        access_token: token(),
        refresh_token: "fake-local-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: user(),
      };
    else if (path === "/auth/v1/user") data = user();
    else if (path === "/auth/v1/logout") data = {};
    else if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.split("/").pop()!;
      calls.push({ name, body });
      if (!signature[name]) {
        status = 404;
        data = { code: "not_implemented_in_test" };
      } else
        await serialized(async () => {
          try {
            await db.exec("begin");
            const bearer = req.headers().authorization || "";
            if (bearer.includes("local-test-signature")) await as(currentUser);
            else {
              await db.exec("set local role anon");
              await db.query(
                "select set_config('request.jwt.claims','{}',true)",
              );
            }
            data = await scalar(
              `select public.${name}(${signature[name].map((_, i) => "$" + (i + 1)).join(",")})`,
              signature[name].map((k) =>
                typeof body[k] === "object" && body[k] !== null
                  ? JSON.stringify(body[k])
                  : body[k],
              ),
            );
            await db.exec("commit; reset role");
          } catch (e) {
            await db.exec("rollback; reset role");
            const x = e as { code: string; message: string };
            console.error("Contract RPC", name, x.code, x.message);
            status = x.code === "42501" ? 403 : x.code === "40001" ? 409 : 400;
            data = { code: x.code, message: x.message };
          }
        });
    } else {
      status = 404;
      data = { message: "Route outside local test contract" };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return {
    A,
    B,
    service,
    manual,
    calls,
    db,
    async adminAction(
      work: (helpers: {
        save: typeof save;
        rev: typeof rev;
        scalar: typeof scalar;
      }) => Promise<void>,
    ) {
      await serialized(async () => {
        await db.exec("begin");
        await as(admin);
        try {
          await work({ save, rev, scalar });
          await db.exec("commit;reset role");
        } catch (e) {
          await db.exec("rollback;reset role");
          throw e;
        }
      });
    },
    async login() {
      await page.goto("/entrar");
      await page
        .getByRole("button", { name: "Acesso da operação VIRELOQ" })
        .click();
      await page
        .getByLabel("E-mail", { exact: true })
        .fill("pessoa@example.invalid");
      await page
        .getByLabel("Senha", { exact: true })
        .fill("FictitiousPassword123!");
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.waitForURL("http://127.0.0.1:4173/");
    },
    async close() {
      await page.unrouteAll({ behavior: "wait" });
      await queue;
      await db.close();
    },
  };
}
