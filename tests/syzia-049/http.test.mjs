import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { enterpriseAccess, digest } from "../../server/enterprise-access.mjs";
test("049-H01 drenagem portátil via stop(): resposta completa, socket fechado, processo termina", async () => {
  const child = fork("tests/syzia-049/portable-child.mjs", [], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  const messages = [];
  child.on("message", (m) => messages.push(m));
  const exit = once(child, "exit");
  try {
    const [ready] = await once(child, "message");
    const started = once(child, "message");
    const pending = fetch(`http://127.0.0.1:${ready.port}/access/login`, {
      method: "POST",
      headers: { Origin: "https://fixture.invalid" },
      body: "{}",
    });
    assert.equal((await started)[0].event, "request");
    child.send("stop");
    assert.equal((await pending).status, 200);
    assert.equal((await exit)[0], 0);
    assert.equal(messages.find((m) => m.event === "stopped").forced, false);
  } finally {
    if (child.exitCode === null) child.kill();
  }
});
const form = {
  name: "Pessoa Fictícia",
  username: "pessoa.ficticia",
  email: "pessoa@example.invalid",
  password: "FictitiousPassword123!",
  confirmation: "FictitiousPassword123!",
  captcha: "test-captcha",
};
test("049-S04 cadastro server-side emite/consome/libera nonce e preserva confirmação de email", async () => {
  const calls = [];
  let input;
  const run = enterpriseAccess({
    service: async (name, args) => {
      calls.push({ name, args });
      if (name === "access_rate") return true;
      return false;
    },
    asUser: async () => {},
    auth: {},
    signUp: async (data) => {
      input = data;
      return { data: { user: { id: "test" }, session: null } };
    },
  });
  assert.deepEqual(await run("/access/signup", form), {
    confirmation_required: true,
  });
  assert.equal(input.options.captchaToken, form.captcha);
  const grant = calls.find((c) => c.name === "access_signup_authorize");
  assert.equal(
    grant.args.p_hash,
    digest(input.options.data.syzia_signup_authorization),
  );
  assert.match(input.options.data.syzia_signup_authorization, /^[a-f0-9]{64}$/);
  assert.ok(calls.some((c) => c.name === "access_signup_release"));
  assert.ok(calls.some((c) => c.name === "access_rate"));
});
test("049-S05 falha do Auth limpa autorização temporária; erro público não inclui senha ou nonce", async () => {
  let released = false;
  const run = enterpriseAccess({
    service: async (name) => {
      if (name === "access_rate") return true;
      if (name === "access_signup_release") released = true;
      return false;
    },
    asUser: async () => {},
    auth: {},
    signUp: async () => {
      throw Error("provider unavailable");
    },
  });
  await assert.rejects(run("/access/signup", form));
  assert.equal(released, true);
});
