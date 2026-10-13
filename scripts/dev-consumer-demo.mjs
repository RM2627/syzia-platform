import {
  enterpriseAccess,
  safeAccessError,
} from "../server/enterprise-access.mjs";
// Disposable LOCAL demo: fake Auth + real SQL in PGlite. NEVER use as an Auth provider.
import { seedMultisegment } from "../tests/fixtures/multisegment.mjs";
import { seedOperationsDemo } from "../tests/fixtures/operations-demo.mjs";
import { seedBillingDemo } from "../tests/fixtures/billing-demo.mjs";
import http from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { seedAnalyticsDemo } from "../tests/fixtures/analytics-demo.mjs";
import { seedCommercial } from "../tests/fixtures/commercial.mjs";
import { seedPresence } from "../tests/fixtures/presence.mjs";
import { spawn } from "node:child_process";
import { consumerDB, users } from "../tests/support/consumer-db.mjs";
import { sanitizeImage, MAX_IMAGE_BYTES } from "../server/images.mjs";
const c = await consumerDB({ through: "202609200029_authorized_support.sql" }),
  files = await seedPresence(c);
await seedCommercial(c);
if (process.env.DEMO_MINIMAL !== "true") {
  await seedAnalyticsDemo(c);
  const plans = await seedBillingDemo(c);
  await seedOperationsDemo(c);
  await seedMultisegment(c, plans.software);
}
await c.db.exec(
  await (
    await import("node:fs/promises")
  ).readFile(
    "supabase/migrations/202609210030_business_finance_permissions.sql",
    "utf8",
  ),
);
await c.db.exec(
  await (
    await import("node:fs/promises")
  ).readFile(
    "supabase/migrations/202609220031_public_presence_experience.sql",
    "utf8",
  ),
);
await c.db.exec(
  await (
    await import("node:fs/promises")
  ).readFile(
    "supabase/migrations/202609220032_syzia_people_experience.sql",
    "utf8",
  ),
);
await c.db.exec(
  await (
    await import("node:fs/promises")
  ).readFile(
    "supabase/migrations/202609240033_acquisition_selfservice_finance.sql",
    "utf8",
  ),
);
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609250036_activation_links.sql", "utf8"));
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609250038_multiservice_requests.sql", "utf8"));
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609250039_commercial_plans.sql", "utf8"));
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609260040_post_homologation.sql", "utf8"));
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609260041_self_service_journeys.sql", "utf8"));
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609260042_operational_refinements.sql", "utf8"));
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609260044_approved_audit_corrections.sql", "utf8"));
await (await import("./team-availability/fixture.mjs")).upgradeTeamFixture(c.db);
await (await import("./flexible-support/fixture.mjs")).upgradeFlexibleFixture(c.db);
process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
process.env.SYZIA_OPERATION_CURRENT = "1";
await (await import("./billing-047/fixture.mjs")).upgradeBillingFixture(c.db);
if (process.env.DEMO_NO_MANUAL_048 === "true") await (await import("./syzia-048/fixture.mjs")).seedNoManualBrowser(c);
(await import("./billing-047/fixture.mjs")).attachBillingRPC(c);
(await import("./syzia-049/fixture.mjs")).attachOperationRPC(c);
if (process.env.DEMO_TEST_MODE === 'true' && process.env.DEMO_LEGAL_050 === 'true') await (await import('./legal-050/browser-fixture.mjs')).publishLocalLegal(c);
// Only this disposable demo publishes fictitious offers; production migration publishes none.
await c.db.exec(
  "reset role;update billing_plans set site_visible=true,self_service=true,self_service_trial=true where active and available;update private.billing_runtime set mock_enabled=true",
);
const accounts = {
  "root@example.invalid": "root",
  "admin@example.invalid": "adminA",
  "adminb@example.invalid": "adminB",
  "adminc@example.invalid": "adminC",
  "agenta@example.invalid": "agentA",
  "backup@example.invalid": "backup",
  "agentb@example.invalid": "agentB",
  "shared@example.invalid": "shared",
  "own@example.invalid": "worker",
  "newadmin@example.invalid": "newadmin",
};

const demoPasswords = new Map(),
  demoOperations = new Map(),
  demoMetadata = new Map();
await c.db.exec("reset role");
for (const [email, name] of Object.entries(accounts))
  if (users[name])
    await c.db.query("update auth.users set email=$1 where id=$2", [
      email,
      users[name],
    ]);
for (const [name, display] of Object.entries({
  root: "Alex • Fictício",
  adminA: "Marina Costa • Fictícia",
  adminB: "Lia Horizonte • Fictícia",
  adminC: "Clara • Fictícia",
}))
  if (users[name])
    await c.db.query("update profiles set display_name=$1 where id=$2", [
      display,
      users[name],
    ]);
let queue = Promise.resolve();
const demoSessionIds = new Map();
const sessionId = (name) => {
  if (!demoSessionIds.has(name)) demoSessionIds.set(name, randomUUID());
  return demoSessionIds.get(name);
};
const token = (name) =>
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({
      name,
      session_id: sessionId(name),
      sub: users[name],
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
  ).toString("base64url") +
  ".fixture";
const user = (name) => ({
  id: users[name],
  role: "authenticated",
  aud: "authenticated",
  is_anonymous:
    ["alice", "bob", "charlie"].includes(name) || name.startsWith("visitor_"),
  email_confirmed_at:
    ["alice", "bob", "charlie"].includes(name) || name.startsWith("visitor_")
      ? null
      : new Date().toISOString(),
  email:
    Object.entries(accounts).find(([, n]) => n === name)?.[0] ||
    name + "@example.invalid",
  user_metadata: demoMetadata.get(name) || {},
  app_metadata: { vireloq_password_operation: demoOperations.get(name) },
  created_at: new Date().toISOString(),
});
const session = (name) => ({
  access_token: token(name),
  refresh_token: name,
  expires_in: 86400,
  token_type: "bearer",
  user: user(name),
});

// Fictitious credentials only. Every business account uses the same server protocol as production.
await c.db.exec("reset role");
for (const [email, name] of Object.entries(accounts)) {
  if (!users[name]) continue;
  const memberships = (
    await c.db.query("select * from organization_members where user_id=$1", [
      users[name],
    ])
  ).rows;
  for (const m of memberships) {
    if (name === "adminC" || name === "newadmin")
      await c.db.query(
        "update private.enterprise_codes set code=$1 where organization_id=$2",
        [
          name === "adminC" ? "C1B2C3D4E5F6" : "D1B2C3D4E5F6",
          m.organization_id,
        ],
      );
    const username =
      {
        adminA: "marina.costa",
        adminB: "lia.horizonte",
        adminC: "clara.nutri",
        worker: "equipe.propria",
        newadmin: "gestor.novo",
      }[name] || name.toLowerCase() + ".demo";
    await c.db.query(
      "insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,role,state,requested_by,request_key,activated_at) values($1,$2,$3,$4,$5,$6,'active',$7,$8,now()) on conflict do nothing",
      [
        m.organization_id,
        users[name],
        username,
        name + " Fictício",
        email,
        m.role === "admin_empresa"
          ? "admin_empresa"
          : m.is_attendant
            ? "own_attendant"
            : "colaborador_empresa",
        users.root,
        randomUUID(),
      ],
    );
  }
}
for (const [org, code] of [
  [c.orgs.A, "A1B2C3D4E5F6"],
  [c.orgs.B, "B1B2C3D4E5F6"],
])
  await c.db.query(
    "update private.enterprise_codes set code=$1 where organization_id=$2",
    [code, org],
  );
const getName = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url")).name;
  } catch {
    return null;
  }
};
const invoke = async (name, args, actor = null, verifiedToken = null) => {
  await c.db.exec("begin");
  try {
    if (actor) {
      await c.as(actor);
      await c.db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: users[actor],
          session_id: verifiedToken
            ? JSON.parse(Buffer.from(verifiedToken.split(".")[1], "base64url"))
                .session_id
            : sessionId(actor),
          is_anonymous: false,
        }),
      ]);
    } else await c.db.exec("set local role service_role");
    const value = await c.rpc(name, args);
    await c.db.exec("commit");
    return value;
  } catch (e) {
    await c.db.exec("rollback");
    throw e;
  } finally {
    await c.db.exec("reset role");
  }
};
let failNextProvision = false; // One-shot local fixture, enabled only by DEMO_TEST_MODE.
const demoAccess = enterpriseAccess({
  service: (name, args) => invoke(name, args),
  asUser: (token, name, args) => invoke(name, args, getName(token), token),
  auth: {
    getUser: async (t) => ({
      data: { user: users[getName(t)] ? user(getName(t)) : null },
    }),
    admin: {
      getUserById: async (id) => ({
        data: {
          user: Object.keys(users).find((n) => users[n] === id)
            ? user(Object.keys(users).find((n) => users[n] === id))
            : null,
        },
      }),
      createUser: async (attrs) => {
        if (failNextProvision) { failNextProvision = false; return { error: { code: "unexpected_failure", status: 503 } }; }
        const name = "provisioned_" + randomUUID();
        users[name] = attrs.id;
        accounts[attrs.email] = name;
        demoPasswords.set(name, attrs.password);
        await c.db.exec("reset role");
        await c.db.query(
          "insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false)",
          [attrs.id, attrs.email],
        );
        return { data: { user: user(name) } };
      },
      updateUserById: async (id, attrs) => {
        const name = Object.keys(users).find((n) => users[n] === id);
        if (!name) return { error: { code: "not_found" } };
        if (attrs.password) demoPasswords.set(name, attrs.password);
        if (attrs.app_metadata?.vireloq_password_operation)
          demoOperations.set(
            name,
            attrs.app_metadata.vireloq_password_operation,
          );
        return { data: { user: user(name) } };
      },
    },
  },
  paymentAdapter: {
    name: "mock",
    mode: "test",
    validateMethod: async ({ draftId, revision }) => ({
      valid: true,
      reference: "demo-method-" + draftId + "-" + revision,
    }),
  },
  signUp: async (credentials) => {
    if (accounts[credentials.email]) return { error: { code: "email_exists" } };
    const name = "selfservice_" + randomUUID(),
      id = randomUUID();
    users[name] = id;
    accounts[credentials.email] = name;
    demoPasswords.set(name, credentials.password);
    demoMetadata.set(name, credentials.options.data);
    await c.db.exec("reset role");
    await c.db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values($1,$2,now(),$3)",
      [id, credentials.email, JSON.stringify(credentials.options.data)],
    );
    return { data: { session: session(name), user: user(name) } };
  },
  signIn: async (credentials) => {
    const name = accounts[credentials.email];
    if (
      !name ||
      (demoPasswords.has(name)
        ? demoPasswords.get(name) !== credentials.password
        : credentials.password !== "FictitiousPassword123!")
    )
      return { error: { code: "invalid_credentials" } };
    demoSessionIds.set(name, randomUUID());
    return { data: { session: session(name), user: user(name) } };
  },
});
const billingFixture = process.env.DEMO_BILLING_047 === "true" ? await (await import("./billing-047/browser-fixture.mjs")).browserBillingFixture({c,invoke,getName,user,serialize: fn=>{const job=queue.then(fn,fn);queue=job.catch(()=>{});return job;}}) : null;
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (
    origin &&
    !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  res.setHeader(
    "Access-Control-Allow-Origin",
    origin || "http://127.0.0.1:5173",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,apikey,content-profile,accept-profile,x-client-info,x-supabase-api-version,X-Download-Ticket",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const send = (code, data) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  let who = "anon";
  try {
    who =
      JSON.parse(
        Buffer.from(
          (req.headers.authorization || "").split(".")[1],
          "base64url",
        ),
      ).name || "anon";
  } catch {}
  if (!Object.hasOwn(users, who)) who = "anon";
  try {
    let n = 0,
      chunks = [];
    for await (const chunk of req) {
      n += chunk.length;
      if (n > MAX_IMAGE_BYTES) {
        send(413, { error: "invalid_image_size" });
        return;
      }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks),
      path = new URL(req.url, "http://localhost").pathname;
    const body =
      bytes.length && req.headers["content-type"]?.includes("application/json")
        ? JSON.parse(bytes)
        : {};
    // Test-only reset of disposable rate windows; absent from normal demo and production.
    if (
      path === "/__test/reset-access-limits" &&
      process.env.DEMO_TEST_MODE === "true" &&
      req.method === "POST"
    ) {
      const clear = async () => {
        await c.db.exec("reset role;delete from private.access_limits");
      };
      const job = queue.then(clear, clear);
      queue = job.catch(() => {});
      await job;
      send(200, { reset: true });
      return;
    }
    if (path === "/__test/legal-050/publish" && process.env.DEMO_TEST_MODE === "true" && process.env.DEMO_LEGAL_050 === "true" && req.method === "POST") {
      const execute = async () => (await import("./legal-050/browser-fixture.mjs")).publishLocalLegal(c);
      const job = queue.then(execute, execute);
      queue = job.catch(() => {});
      send(200, await job);
      return;
    }
    if (path === "/__test/fail-next-provision" && process.env.DEMO_TEST_MODE === "true" && req.method === "POST") {
      failNextProvision = true;
      send(200, { armed: true });
      return;
    }
    if (path.startsWith("/billing/") && billingFixture) {
      try {send(200,await billingFixture.billing.user(path.split("/").at(-1),body,(req.headers.authorization||"").replace(/^Bearer /,"")));}
      catch(e){send(409,{error:e.code||e.message});}return;
    }
    if (path.startsWith("/access/")) {
      const execute = async () => {
        try {
          send(
            200,
            await demoAccess(path, body, {
              token: (req.headers.authorization || "").replace(/^Bearer /, ""),
              ip: "demo-loopback",
            }),
          );
        } catch (e) {
          const safe = safeAccessError(e);
          send(safe.status, {
            error: safe.code,
            stage: safe.stage,
            organization_id: safe.organization_id,
            account_id: safe.account_id,
          });
        }
      };
      const job = queue.then(execute, execute);
      queue = job.catch(() => {});
      await job;
      return;
    }
    if (path === "/auth/v1/signup") {
      if (body.email || body.password || body.phone) {
        send(403, { message: "Administrative signup disabled" });
        return;
      }
      if (
        process.env.DEMO_MINIMAL === "true" &&
        body.data?.fixture_user === "bob"
      ) {
        send(200, session("bob"));
        return;
      }
      const id = randomUUID(),
        name = "visitor_" + id;
      const create = async () => {
        await c.db.exec("begin;reset role");
        try {
          await c.db.query(
            "insert into auth.users(id,is_anonymous) values($1,true)",
            [id],
          );
          await c.db.exec("commit;reset role");
          users[name] = id;
        } catch (e) {
          await c.db.exec("rollback;reset role");
          throw e;
        }
      };
      const pending = queue.then(create, create);
      queue = pending.catch(() => {});
      await pending;
      send(200, session(name));
      return;
    }
    if (path === "/auth/v1/token") {
      const name = Object.hasOwn(users, body.refresh_token)
        ? body.refresh_token
        : accounts[body.email?.toLowerCase()];
      if (
        !name ||
        (!body.refresh_token &&
          demoPasswords.has(name) &&
          demoPasswords.get(name) !== body.password)
      ) {
        send(400, {
          message: "Use uma das contas fictícias listadas no guia da demo.",
        });
        return;
      }
      send(200, session(name));
      return;
    }
    if (path === "/auth/v1/user") {
      if (req.method === "PUT" && who !== "anon" && body.password) {
        if (body.password.length < 12) throw Error("password_too_short");
        demoPasswords.set(who, body.password);
      }
      send(
        who === "anon" ? 401 : 200,
        who === "anon" ? { message: "session_required" } : user(who),
      );
      return;
    }
    if (path === "/auth/v1/logout") {
      send(200, {});
      return;
    }
    const run = async () => {
      await c.db.exec("begin");
      try {
        await c.as(who);
        if (who !== "anon")
          await c.db.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              sub: users[who],
              session_id: JSON.parse(
                Buffer.from(
                  (req.headers.authorization || "").split(".")[1],
                  "base64url",
                ),
              ).session_id,
              is_anonymous: user(who).is_anonymous,
            }),
          ]);
        let data;
        if (path.startsWith("/rest/v1/rpc/")) {
          const name = path.split("/").pop();
          if (
            !/^(employee|assisted|acquisition|selfservice|people|permissions|financial|support|access|consumer|central|commercial|company|foundation|analytics|billing|billing047|operations|onboarding)_[a-z_]+$/.test(
              name,
            ) ||
            name.startsWith("consumer_gateway") ||
            name.startsWith("consumer_finalize_")
          )
            throw Object.assign(Error("access_denied"), { code: "42501" });
          const meta = (
            await c.db.query(
              "select proargnames from pg_proc where pronamespace='public'::regnamespace and proname=$1",
              [name],
            )
          ).rows[0];
          if (!meta) throw Error("not_found");
          const names = (meta.proargnames || []).filter((name) =>
            Object.hasOwn(body, name),
          );
          data = await c.scalar(
            `select ${name}(${names.map((n, i) => `${n}=>$${i + 1}`).join(",")})`,
            names.map((n) =>
              (body[n] && typeof body[n] === "object" && !Array.isArray(body[n])) || ["p_hours", "p_blocks"].includes(n)
                ? JSON.stringify(body[n])
                : (body[n] ?? null),
            ),
          );
        } else if (/^\/rest\/v1\/[a-z_]+$/.test(path) && req.method === "GET") {
          // Read-only emulation with parameterized filters, executed AS caller with original RLS.
          const table = path.split("/").pop(),
            query = new URL(req.url, "http://localhost").searchParams;
          const columns = (
            await c.db.query(
              "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
              [table],
            )
          ).rows.map((x) => x.column_name);
          const requested = query.get("select") || "*";
          const selected = requested === "*" ? columns : requested.split(",");
          if (
            !columns.length ||
            !selected.length ||
            selected.some((name) => !columns.includes(name))
          )
            throw Error("unsupported_demo_query");
          const projection = selected.map((name) => '"' + name + '"').join(",");
          const values = [],
            filters = [];
          for (const [key, value] of query) {
            if (["select", "order", "offset", "limit"].includes(key)) continue;
            if (!columns.includes(key) || !value.startsWith("eq."))
              throw Error("unsupported_demo_filter");
            values.push(value.slice(3));
            filters.push(`"${key}"=$${values.length}`);
          }
          let order = "";
          if (query.has("order")) {
            const [column, direction] = query.get("order").split(".");
            if (
              !columns.includes(column) ||
              !["asc", "desc"].includes(direction)
            )
              throw Error("unsupported_demo_order");
            order = ` order by "${column}" ${direction}`;
          }
          const offset = Number(query.get("offset") || 0),
            limit = Number(query.get("limit") || 100);
          if (
            !Number.isSafeInteger(offset) ||
            offset < 0 ||
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 1000
          )
            throw Error("unsupported_demo_range");
          data = (
            await c.db.query(
              `select ${projection} from public."${table}"${filters.length ? " where " + filters.join(" and ") : ""}${order} limit ${limit} offset ${offset}`,
              values,
            )
          ).rows;
        } else if (/^\/media\/m_[a-f0-9]{24}$/.test(path)) {
          const code = path.split("/").pop();
          await c.db.exec("reset role;set local role service_role");
          await c.rpc("consumer_gateway_public_media", { p_code: code });
          data = files.get(code);
          if (!data) throw Error("not_found");
        } else if (
          /^\/(attachments|company-media)\/[fm]_[a-f0-9]{24}$/.test(path)
        ) {
          const code = path.split("/").pop();
          const company = path.startsWith("/company-media/");
          if (who === "anon") throw Error("session_required");
          await c.db.exec("reset role;set local role service_role");
          const mediaRPC = (name, args) =>
            c.rpc("access_media", {
              p_user: users[who],
              p_session: JSON.parse(
                Buffer.from(
                  (req.headers.authorization || "").split(".")[1],
                  "base64url",
                ),
              ).session_id,
              p_operation: name,
              p_args: args,
            });
          if (req.method === "POST") {
            const item = await mediaRPC(
              company
                ? "consumer_gateway_company_media"
                : "consumer_gateway_attachment",
              {
                p_code: code,
                p_user: users[who],
                p_write: true,
              },
            );
            if (item.state !== "ready") {
              if (
                bytes.length !== item.size ||
                req.headers["content-type"] !== item.mime
              )
                throw Error("invalid_image_metadata");
              const clean = await sanitizeImage(bytes, item.mime);
              await mediaRPC(
                company
                  ? "consumer_finalize_company_media"
                  : "consumer_finalize_attachment",
                {
                  p_code: code,
                  p_user: users[who],
                  p_sha256: clean.sha256,
                  p_size: clean.size,
                  p_width: clean.width,
                  p_height: clean.height,
                },
              );
              files.set(code, clean);
            }
            data = { code };
          } else if (req.method === "GET") {
            await mediaRPC(
              company
                ? "consumer_gateway_company_media"
                : "consumer_gateway_download",
              company
                ? { p_code: code, p_user: users[who], p_write: false }
                : {
                    p_code: code,
                    p_user: users[who],
                    p_ticket: req.headers["x-download-ticket"],
                  },
            );
            data = files.get(code);
            if (!data) throw Error("not_found");
          } else throw Error("not_found");
        } else throw Error("not_found");
        await c.db.exec("commit;reset role");
        return data;
      } catch (e) {
        await c.db.exec("rollback;reset role");
        throw e;
      }
    };
    const task = queue.then(run, run);
    queue = task.catch(() => {});
    const result = await task;
    if (result?.data && Buffer.isBuffer(result.data)) {
      res.writeHead(200, { "Content-Type": result.mime });
      res.end(result.data);
    } else send(200, result);
  } catch (e) {
    send(e.code === "42501" ? 403 : 400, {
      message: e.message,
      error: e.message,
      code: e.code,
    });
  }
});
server.listen(54321, "127.0.0.1", () => {
  const child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_fixture_only",
        VITE_ATTACHMENT_GATEWAY_URL: "http://127.0.0.1:54321",
        VITE_TURNSTILE_SITE_KEY: "",
        VITE_LOCAL_DEMO: "true",
        VITE_PLATFORM_API_URL: "http://127.0.0.1:54321",
        VITE_BILLING_API_URL: "http://127.0.0.1:54321",
      },
    },
  );
  console.log(
    "DEMO LOCAL: http://127.0.0.1:5173/empresa/ms-auto-ficticia — Auth simulado; dados descartados ao parar.",
  );
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    child.kill();
    server.close();
    await queue;
    await c.db.close();
    process.exit();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", stop);
});
