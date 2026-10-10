import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createAttachmentServer } from "../server/attachments.mjs";
import { safeDiagnostic } from "../server/diagnostics.mjs";
test("HTTP media adapter: four media types, upload/read/replace, session forwarding and safe failures", async () => {
  const records = new Map(),
    storage = new Map(),
    calls = [],
    logs = [];
  let failStorage = false;
  const bytes = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#E10909" },
  })
    .png()
    .toBuffer();
  const user = "10000000-0000-0000-0000-000000000001",
    sid = "20000000-0000-0000-0000-000000000001";
  const server = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      const a = args.p_args || args;
      const r = records.get(a.p_code);
      if (!r)
        return {
          error: { code: "42501", message: "company_media_access_denied" },
        };
      if (args.p_operation?.startsWith("consumer_finalize")) {
        r.state = "ready";
        r.mime = "image/webp";
        r.size = a.p_size;
        return { data: null };
      }
      if (name === "access_media" && args.p_session !== sid)
        return { error: { code: "42501", message: "session_expired" } };
      return { data: r };
    },
    storage: {
      from: () => ({
        upload: async (path, data) => {
          if (failStorage) return { error: { statusCode: "404" } };
          storage.set(path, data);
          return { error: null };
        },
        download: async (path) =>
          storage.has(path)
            ? { data: new Blob([storage.get(path)]) }
            : { error: { statusCode: "404" } },
      }),
    },
  };
  const app = createAttachmentServer({
    server,
    verifier: {
      auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    },
    origin: "http://localhost:5173",
    log: (x) => logs.push(x),
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const headers = {
    Origin: "http://localhost:5173",
    Authorization:
      "Bearer x." +
      Buffer.from(JSON.stringify({ session_id: sid })).toString("base64url") +
      ".x",
    "Content-Type": "image/png",
  };
  try {
    let n = 0;
    for (const type of ["logo", "cover", "service", "portfolio"]) {
      let previous;
      for (let round = 0; round < 2; round++) {
        const code = "m_" + (++n).toString(16).padStart(24, "0"),
          path = user + "/" + code;
        records.set(code, {
          path,
          mime: "image/png",
          size: bytes.length,
          state: "pending",
        });
        const sent = await fetch(base + "/company-media/" + code, {
          method: "POST",
          headers,
          body: bytes,
        });
        assert.equal(sent.status, 200, type);
        assert.equal(records.get(code).state, "ready");
        const image = await fetch(base + "/company-media/" + code, { headers });
        assert.equal(image.status, 200);
        assert.ok((await image.arrayBuffer()).byteLength > 0);
        if (previous)
          assert.ok(
            storage.has(previous),
            "old media retained for published snapshots",
          );
        previous = path;
      }
      // Removing a reference must not delete immutable historical media; reference removal is exercised in SQL/browser.
    }
    assert.ok(
      calls
        .filter((c) => c.name === "access_media")
        .every((c) => c.args.p_session === sid && c.args.p_user === user),
    );
    const code = "m_" + "f".repeat(24);
    records.set(code, {
      path: user + "/" + code,
      mime: "image/png",
      size: bytes.length,
      state: "pending",
    });
    failStorage = true;
    assert.equal(
      (
        await fetch(base + "/company-media/" + code, {
          method: "POST",
          headers,
          body: bytes,
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await fetch(base + "/company-media/" + code, {
          method: "POST",
          headers: { ...headers, Origin: "http://unauthorized.invalid" },
          body: bytes,
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + "/company-media/m_" + "e".repeat(24), { headers }))
        .status,
      403,
    );
    assert.ok(logs.some((x) => x.operation === "storage_upload"));
    assert.ok(!JSON.stringify(logs).includes(headers.Authorization));
  } finally {
    await new Promise((r) => app.close(r));
  }
});
test("Diagnostics never copy arbitrary provider messages or credentials", () => {
  const d = safeDiagnostic(
    { message: "secret password token email@example.invalid", code: "42501" },
    "access_media",
    403,
  );
  assert.equal(d.reason, "unclassified");
  assert.equal(d.category, "authorization");
  assert.ok(!JSON.stringify(d).includes("password"));
});
