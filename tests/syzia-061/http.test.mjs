import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createInsightsHandler } from "../../server/insights/http.mjs";
test("061 HTTP: CSRF, cookies, bounded bodies, media sanitization and missing articles", async (t) => {
  let origin, handler;
  const calls = [],
    id = randomUUID();
  const server = createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  handler = createInsightsHandler({
    origin,
    adminOrigin: origin,
    secret: "offline-secret-only-for-local-tests-061",
    resolveIdentity: async (token) =>
      token === "valid-session" ? "verified-user-id" : null,
    service: async (a, d) => {
      calls.push({ a, d });
      if (a === "catalog") return { posts: [], redirects: {} };
      return { count: 1, liked: true };
    },
    asUser: async (token, a, d) => {
      assert.equal(token, "offline-editor-token");
      if (a === "access") return { allowed: true };
      assert.equal(a, "media_add");
      const image = await sharp(Buffer.from(d.body, "base64")).metadata();
      assert.equal(image.format, "webp");
      assert.equal(image.exif, undefined);
      return { id };
    },
  });
  try {
    await t.test("HTML 404 is real; logo and styles load", async () => {
      const r = await fetch(origin + "/blog/missing");
      assert.equal(r.status, 404);
      assert.match(await r.text(), /noindex/);
      assert.equal((await fetch(origin + "/blog/assets/logo.png")).status, 200);
    });
    await t.test(
      "cross-origin mutation denied, cookie signed and HttpOnly",
      async () => {
        const request = (headers = {}) =>
          fetch(origin + "/blog/api/like", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ id, liked: true }),
          });
        assert.equal(
          (await request({ Origin: "https://hostile.invalid" })).status,
          403,
        );
        const r = await request({ Origin: origin });
        assert.equal(r.status, 200);
        assert.match(r.headers.get("set-cookie"), /HttpOnly/);
        assert.match(r.headers.get("set-cookie"), /SameSite=Lax/);
        assert.match(calls.at(-1).d.visitor, /^[a-f0-9]{64}$/);
      },
    );
    await t.test(
      "verified account identity is stable across browsers; invalid bearer is rejected",
      async () => {
        const req = (token) =>
          fetch(origin + "/blog/api/likes", {
            method: "POST",
            headers: { Origin: origin, Authorization: "Bearer " + token },
            body: JSON.stringify({ id }),
          });
        assert.equal((await req("valid-session")).status, 200);
        const first = calls.at(-1).d.visitor;
        assert.equal((await req("valid-session")).status, 200);
        assert.equal(calls.at(-1).d.visitor, first);
        const n = calls.length;
        assert.equal((await req("invalid-session")).status, 401);
        assert.equal(calls.length, n);
      },
    );
    await t.test("oversize and invalid body rejected", async () => {
      const r = await fetch(origin + "/blog/api/like", {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ id, liked: true, padding: "x".repeat(13000) }),
      });
      assert.equal(r.status, 400);
    });
    await t.test(
      "authenticated upload re-encodes raster and rejects SVG",
      async () => {
        const post = (body) =>
          fetch(origin + "/blog/api/media", {
            method: "POST",
            headers: {
              Origin: origin,
              Authorization: "Bearer offline-editor-token",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ alt: "Imagem de exemplo local", body }),
          });
        const png = await sharp({
          create: {
            width: 200,
            height: 100,
            channels: 3,
            background: "#6040d8",
          },
        })
          .png()
          .toBuffer();
        assert.equal((await post(png.toString("base64"))).status, 200);
        assert.equal(
          (
            await post(
              Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString(
                "base64",
              ),
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await fetch(origin + "/blog/api/media", {
              method: "POST",
              headers: { Origin: origin },
              body: "{}",
            })
          ).status,
          401,
        );
      },
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
