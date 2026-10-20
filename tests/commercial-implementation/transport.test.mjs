import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createCommercialHandler } from "../../server/commercial/http.mjs";
import {
  createCommercialMailer,
  invitationMessage,
} from "../../server/commercial/mail.mjs";
import { secretBox } from "../../server/commercial/crypto.mjs";
import { validateConfiguration } from "../../server/commercial/configuration.mjs";
import { assetPromoter } from "../../server/commercial/promote-assets.mjs";
import { digest } from "../../server/commercial/crypto.mjs";
import { commercialRuntime } from "../../server/commercial/runtime.mjs";
const origins = {
  appOrigin: "https://app.example.invalid",
  publicOrigin: "https://demo.example.invalid",
};
async function harness(fn) {
  const seen = [],
    logs = [];
  const handler = createCommercialHandler({
    origins,
    controller: {
      operator: async (...a) => {
        seen.push(a);
        if (a[1].failure)
          throw Error("raw secret and personal@example.invalid");
        return { ok: true };
      },
      visitor: async (...a) => {
        seen.push(a);
        return { ok: true };
      },
    },
    log: (r) => logs.push(r),
  });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await fn("http://127.0.0.1:" + server.address().port, seen, logs);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const post = (url, path, origin, body = {}, headers = {}) =>
  fetch(url + path, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
test("H01 strict application/demo origins including activation route, no permissive CORS", () =>
  harness(async (url, seen) => {
    assert.equal(
      (await post(url, "/commercial/preview", origins.publicOrigin)).status,
      403,
    );
    assert.equal(
      (await post(url, "/demonstrations/start", origins.appOrigin)).status,
      403,
    );
    assert.equal(
      (await post(url, "/demonstrations/invite", origins.appOrigin)).status,
      200,
    );
    const r = await post(
      url,
      "/commercial/preview",
      origins.appOrigin,
      {},
      { Authorization: "Bearer opaque-test" },
    );
    assert.equal(r.status, 200);
    assert.equal(
      r.headers.get("access-control-allow-origin"),
      origins.appOrigin,
    );
    assert.equal(seen.length, 2);
    assert.equal(seen[1][2], "opaque-test");
  }));
test("H02 invalid bodies/methods never reach controller and errors/logs contain no raw data", () =>
  harness(async (url, seen, logs) => {
    const a = await fetch(url + "/commercial/send", {
      method: "POST",
      headers: {
        Origin: origins.appOrigin,
        "Content-Type": "application/json",
      },
      body: "{",
    });
    assert.equal(a.status, 400);
    assert.equal(seen.length, 0);
    const b = await post(url, "/commercial/send", origins.appOrigin, {
      failure: true,
    });
    const body = await b.text();
    assert.doesNotMatch(
      body + JSON.stringify(logs),
      /raw secret|personal@example/,
    );
    assert.match(body, /request_id/);
    assert.equal(
      (
        await post(url, "/commercial/send", origins.appOrigin, {
          data: "x".repeat(2100000),
        })
      ).status,
      413,
    );
  }));
test("H03 start throttling is independent of regular RPC traffic", () =>
  harness(async (url) => {
    for (let i = 0; i < 15; i++)
      assert.equal(
        (await post(url, "/demonstrations/rpc", origins.publicOrigin)).status,
        200,
      );
    for (let i = 0; i < 12; i++)
      assert.equal(
        (await post(url, "/demonstrations/start", origins.publicOrigin)).status,
        200,
      );
    assert.equal(
      (await post(url, "/demonstrations/start", origins.publicOrigin)).status,
      429,
    );
  }));
const envelope = {
  email: "marina@example.invalid",
  name: "Marina <Aurora>",
  company: "Aurora & Interiores",
  purpose: "demonstration",
  link: origins.publicOrigin + "/aurora#convite=abc",
  unsubscribe: origins.appOrigin + "/convites/descadastrar#convite=abc",
  contact: "contato@example.invalid",
  expires_at: "2026-11-01T12:00:00Z",
};
test("E01 default-off commercial mail makes no SMTP connection", async () => {
  let calls = 0;
  await assert.rejects(
    createCommercialMailer({}, () => {
      calls++;
    })(envelope),
    /not_configured/,
  );
  assert.equal(calls, 0);
});
test("E02 existing authorized SMTP transport sends one recipient, approved brand and safe HTML", async () => {
  let got, options;
  const send = createCommercialMailer(
    {
      COMMERCIAL_MAIL_ENABLED: "true",
      ACCESS_MAIL_ENABLED: "true",
      ACCESS_SMTP_HOST: "smtp.example.invalid",
      ACCESS_SMTP_USER: "fixture",
      ACCESS_SMTP_PASSWORD: "offline-only",
      ACCESS_MAIL_FROM: "SYZIA <contato@example.invalid>",
    },
    (o) => {
      options = o;
      return {
        sendMail: async (m) => {
          got = m;
          return { accepted: [m.to], rejected: [] };
        },
      };
    },
  );
  await send(envelope);
  assert.equal(got.to, envelope.email);
  assert.equal(got.cc, undefined);
  assert.equal(got.bcc, undefined);
  assert.match(got.html, /Marina &lt;Aurora&gt;/);
  assert.match(got.html, /cid:syzia-brand/);
  assert.equal(got.attachments[0].contentType, "image/png");
  assert.ok(
    options.requireTLS && options.disableUrlAccess && options.disableFileAccess,
  );
  assert.equal(options.logger, false);
  assert.throws(() =>
    invitationMessage({
      ...envelope,
      email: "a@example.invalid\nBcc: b@example.invalid",
    }),
  );
});
test("E03 sealed links use authenticated encryption; alteration/wrong key rejected", () => {
  const a = secretBox(randomBytes(32).toString("base64")),
    b = secretBox(randomBytes(32).toString("base64")),
    value = { token: "private-secret", id: "fixture" },
    sealed = a.seal(value);
  assert.doesNotMatch(sealed, /private-secret/);
  assert.deepEqual(a.open(sealed), value);
  assert.throws(() => b.open(sealed), /delivery_unavailable/);
  assert.throws(() => a.open("invalid"), /delivery_unavailable/);
});
test("X01 configuration refuses business records, grants, arbitrary keys and excessive rows", () => {
  const valid = {
    format: "syzia-config-054",
    template: "current",
    tables: { services: [] },
  };
  assert.equal(validateConfiguration(valid), valid);
  for (const tables of [
    { customers: [] },
    { organization_members: [] },
    { services: [{ id: "x", organization_id: "other" }] },
    { services: Array.from({ length: 201 }, () => ({})) },
  ])
    assert.throws(() => validateConfiguration({ ...valid, tables }), /invalid/);
});
test("X02 approved image promotion verifies hash and MIME before touching operational storage", async () => {
  const bytes = Buffer.from("synthetic sanitized object"),
    hash = digest(bytes);
  let uploads = 0;
  const store = { preparedMedia: async () => ({ bytes, mime: "image/png" }) },
    storage = {
      from: () => ({
        upload: async () => {
          uploads++;
          return { error: null };
        },
      }),
    },
    promote = assetPromoter({ store, storage }),
    config = {
      tables: {
        company_media: [
          {
            state: "ready",
            sha256: hash,
            mime: "image/png",
            object_path: "private/path",
          },
        ],
      },
    };
  const r = await promote(config, { id: "demo-id", organization_id:"05500000-0000-4000-8000-000000000001",claim_id:"05500000-0000-4000-8000-000000000002" });
  assert.equal(uploads, 1);
  assert.equal(r.tables.company_media[0].object_path, "05500000-0000-4000-8000-000000000001/commercial/05500000-0000-4000-8000-000000000002/"+hash+".png");
  assert.equal(config.tables.company_media[0].object_path, "private/path");
  await assert.rejects(
    promote(
      {
        tables: {
          company_media: [{ ...config.tables.company_media[0], sha256: "bad" }],
        },
      },
      { id: "demo-id" },
    ),
    /media_invalid/,
  );
  assert.equal(uploads, 1);
});
test("H04 commercial runtime default-off does not require or open another service", async () => {
  assert.equal(await commercialRuntime({}), null);
  await assert.rejects(
    commercialRuntime({
      COMMERCIAL_ENABLED: "true",
      PLATFORM_APP_ORIGIN: origins.appOrigin,
      COMMERCIAL_DEMO_ORIGIN: origins.publicOrigin,
    }),
    /demo_database_required/,
  );
});
