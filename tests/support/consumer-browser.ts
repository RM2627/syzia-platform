import type { Page } from "@playwright/test";
import { consumerDB, users } from "./consumer-db.mjs";
import { seedPresence } from "../fixtures/presence.mjs";
import { sanitizeImage } from "../../server/images.mjs";
import { seedCommercial } from "../fixtures/commercial.mjs";
import { seedCentral } from "../fixtures/central.mjs";
export async function setupConsumer(
  page: Page,
  options: { central?: boolean; commercial?: boolean } = {},
) {
  const c = await consumerDB();
  const mediaFiles = await seedPresence(c);
  const central = options.commercial
    ? await seedCommercial(c)
    : options.central
      ? await seedCentral(c)
      : undefined;
  let queue = Promise.resolve();
  const calls: string[] = [];
  const user = (name: string) => ({
    id: users[name],
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: ["alice", "bob", "charlie"].includes(name),
    email: name === "adminA" ? "admin@example.invalid" : undefined,
    email_confirmed_at: ["alice", "bob", "charlie"].includes(name)
      ? null
      : new Date().toISOString(),
    app_metadata: { provider: "anonymous", providers: ["anonymous"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  });
  const token = (name: string) =>
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: users[name],
        name,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".local-signature";
  const session = (name: string) => ({
    access_token: token(name),
    refresh_token: "local-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: user(name),
  });
  function caller(req: any) {
    try {
      return (
        JSON.parse(
          Buffer.from(
            (req.headers().authorization || "").split(".")[1],
            "base64url",
          ).toString(),
        ).name || "anon"
      );
    } catch {
      return "anon";
    }
  }
  async function serial(fn: () => Promise<any>) {
    const result = queue.then(fn, fn);
    queue = result.catch(() => {});
    return result;
  }
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      body = req.postData() ? req.postDataJSON() : {};
    let data: any = {},
      status = 200;
    try {
      if (path.startsWith("/media/")) {
        const code = path.split("/").pop()!;
        try {
          await serial(async () => {
            await c.db.exec("begin;set local role service_role");
            try {
              await c.rpc("consumer_gateway_public_media", { p_code: code });
              await c.db.exec("commit;reset role");
            } catch (e) {
              await c.db.exec("rollback;reset role");
              throw e;
            }
          });
          const file = mediaFiles.get(code);
          if (!file) throw Error();
          await route.fulfill({
            status: 200,
            contentType: file.mime,
            body: file.data,
          });
          return;
        } catch {
          await route.fulfill({ status: 403, body: "Denied" });
          return;
        }
      }
      if (path === "/auth/v1/signup") data = session("alice");
      else if (path === "/auth/v1/token" || path === "/access/global-login")
        data = session(
          body.grant_type === "refresh_token"
            ? "alice"
            : body.email?.startsWith("agenta")
              ? "agentA"
              : body.email?.startsWith("backup")
                ? "backup"
                : body.email?.startsWith("agentb")
                  ? "agentB"
                  : body.email?.startsWith("shared")
                    ? "shared"
                    : body.email?.startsWith("worker")
                      ? "worker"
                      : body.email?.startsWith("adminb")
                        ? "adminB"
                        : "adminA",
        );
      else if (path === "/auth/v1/user") data = user(caller(req));
      else if (path === "/auth/v1/logout") data = {};
      else if (path.startsWith("/rest/v1/rpc/")) {
        const name = path.split("/").pop()!;
        calls.push(name);
        data = await serial(async () => {
          await c.db.exec("begin");
          try {
            await c.as(caller(req));
            let value;
            if (
              /^(permissions|financial|billing|company|access|consumer|central|commercial|analytics|operations|onboarding)_/.test(
                name,
              )
            )
              value = await c.rpc(name, body);
            else if (name === "foundation_context")
              value = await c.scalar("select foundation_context()");
            else if (name === "company_context")
              value = await c.scalar("select company_context($1)", [
                body.p_org,
              ]);
            else throw Error("unsupported_test_rpc");
            await c.db.exec("commit;reset role");
            return value;
          } catch (e) {
            await c.db.exec("rollback;reset role");
            throw e;
          }
        });
      } else {
        status = 404;
        data = { message: "unsupported_test_route" };
      }
    } catch (e: any) {
      status = e.code === "42501" ? 403 : e.code === "40001" ? 409 : 400;
      data = { message: e.message, code: e.code };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(
        path === "/access/global-login" ? { session: data } : data,
      ),
    });
  });
  return {
    ...c,
    calls,
    central,
    async asAdmin(fn: (c: any) => Promise<void>) {
      await serial(async () => {
        await c.db.exec("begin");
        try {
          await c.as("adminA");
          await fn(c);
          await c.db.exec("commit;reset role");
        } catch (e) {
          await c.db.exec("rollback;reset role");
          throw e;
        }
      });
    },
    async close() {
      await page.unrouteAll({ behavior: "wait" });
      await queue;
      await c.db.close();
    },
  };
}
