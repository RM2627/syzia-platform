import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
const child = spawn(process.execPath, ["scripts/dev-consumer-demo.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {...process.env, DEMO_MINIMAL:"true"},
});
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(Error("demo_start_timeout")), 45000);
  child.on("error", reject);
  child.on("exit", (code) => {
    clearTimeout(timeout);
    reject(Error("demo_exit_" + code));
  });
  child.stdout.on("data", (data) => {
    if (data.toString().includes("DEMO LOCAL:")) {
      clearTimeout(timeout);
      resolve();
    }
  });
});
try {
  const base = "http://127.0.0.1:54321",
    origin = "http://127.0.0.1:5173";
  async function call(path, body, token) {
    const r = await fetch(base + path, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Authorization: "Bearer " + (token || "public"),
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw Error(JSON.stringify(data));
    return data;
  }
  const a = await call("/auth/v1/signup", {}),
    b = await call("/auth/v1/signup", { data: { fixture_user: "bob" } });
  const rpc = (name, args, t = a.access_token) =>
    call("/rest/v1/rpc/" + name, args, t);
  const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
    s = p.services.find((s) => s.price_mode === "fixed");
  const q = await rpc("consumer_create_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_service: s.code,
    p_addons: [],
    p_answers: { [s.questions[0].code]: "Carro de teste" },
    p_customer: {
      name: "Imagem fictícia",
      whatsapp: "81999990000",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "",
    p_contact: false,
    p_expected_cents: 12000,
    p_key: randomUUID(),
  });
  const img = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "green" },
    })
      .jpeg()
      .toBuffer(),
    f = await rpc("consumer_reserve_attachment", {
      p_code: q.code,
      p_mime: "image/jpeg",
      p_size: img.length,
      p_key: randomUUID(),
    });
  let r = await fetch(base + "/attachments/" + f.code, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer " + a.access_token,
      "Content-Type": "image/jpeg",
    },
    body: img,
  });
  assert.equal(r.status, 200, await r.text());
  await assert.rejects(
    rpc("consumer_attachment_ticket", { p_code: f.code }, b.access_token),
  );
  const ticket = await rpc("consumer_attachment_ticket", { p_code: f.code });
  r = await fetch(base + "/attachments/" + f.code, {
    headers: {
      Origin: origin,
      Authorization: "Bearer " + a.access_token,
      "X-Download-Ticket": ticket.ticket,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await sharp(Buffer.from(await r.arrayBuffer())).metadata()).width,
    40,
  );
  r = await fetch(base + "/attachments/" + f.code, {
    headers: {
      Origin: origin,
      Authorization: "Bearer " + a.access_token,
      "X-Download-Ticket": ticket.ticket,
    },
  });
  assert.equal(r.status, 403);
  await rpc("consumer_submit_request", {
    p_code: q.code,
    p_attachment_count: 1,
    p_key: randomUUID(),
  });
  assert.equal(
    (await rpc("consumer_request_context", { p_code: q.code })).state,
    "submitted",
  );
  console.log(
    "PASS integração HTTP loopback da demonstração: Auth simulado, SQL real PGlite, upload sanitizado, download, isolamento, ticket de uso único, envio com anexo. Não é Supabase/Storage real.",
  );

  await writeFile(
    "reports/demo-http-results.json",
    JSON.stringify(
      {
        environment: "HTTP local loopback; PGlite; Auth/Storage simulados",
        tests: [
          {
            name: "Upload, download, isolamento, ticket único e envio com anexo",
            status: "PASS",
          },
        ],
      },
      null,
      2,
    ),
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}
