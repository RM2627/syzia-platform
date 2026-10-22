import test from "node:test";
import assert from "node:assert/strict";
import { enterpriseAccess } from "../../server/enterprise-access.mjs";

const userId = "10000000-0000-0000-0000-000000000001";
const sessionId = "20000000-0000-0000-0000-000000000001";
const accountId = "30000000-0000-0000-0000-000000000001";

const token = "header." +
  Buffer.from(JSON.stringify({
    sub: userId,
    session_id: sessionId
  })).toString("base64url") + ".signature";

test("059: endpoint recupera sessao pessoal valida", async () => {
  const calls = [];

  const service = async (name, args) => {
    calls.push({ name, args });
    if (name === "access_rate") return true;

    if (name === "access_selfservice_identity")
      return { id: accountId, generation: 1 };

    if (name === "access_register_session")
      return false;

    if (name === "access_complete_personal_session")
      return true;

    throw Error("unexpected_service: " + name);
  };

  const access = enterpriseAccess({
    service,
    asUser: async () => null,
    auth: {
      getUser: async () => ({
        data: {
          user: { id: userId, is_anonymous: false }
        }
      })
    }
  });

  const result = await access(
    "/access/selfservice-register",
    {
      name: "Cliente Teste",
      username: "cliente.teste"
    },
    { token }
  );

  assert.equal(result.registered, true);

  assert.deepEqual(
    calls.map(x => x.name).filter(name => name !== "access_rate"),
    [
      "access_selfservice_identity",
      "access_register_session",
      "access_complete_personal_session"
    ]
  );

  assert.equal(calls[2].args.p_user, userId);
  assert.equal(calls[2].args.p_session, sessionId);
  assert.equal(calls[2].args.p_account, accountId);
});

test("059: recuperacao recusada nao concede identidade", async () => {
  const access = enterpriseAccess({
    service: async name => {
      if (name === "access_rate") return true;
      if (name === "access_selfservice_identity")
        return { id: accountId, generation: 1 };

      return false;
    },
    asUser: async () => null,
    auth: {
      getUser: async () => ({
        data: {
          user: { id: userId, is_anonymous: false }
        }
      })
    }
  });

  await assert.rejects(
    access(
      "/access/selfservice-register",
      { name: "Cliente Teste", username: "cliente.teste" },
      { token }
    ),
    error => error.code === "access_denied"
  );
});
