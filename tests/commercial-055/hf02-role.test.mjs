import test from "node:test";
import assert from "node:assert/strict";
import { createDemoStore } from "../../server/commercial/demo-store.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const MANAGER = "22222222-2222-4222-8222-222222222222";
const CONSUMER = "33333333-3333-4333-8333-333333333333";
const CODE = "m_" + "a".repeat(24);

function fixture() {
  const calls = [];
  let released = false;

  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/set\s+(local\s+)?role\s+service_role/i.test(sql)) {
        throw Object.assign(new Error("permission denied to set role"), {
          code: "42501",
        });
      }

      if (sql.includes("select purpose from demo_private.identity")) {
        return { rows: [{ purpose: "syzia-commercial-demo-054" }] };
      }

      if (sql.includes("select organization_id from public.company_media")) {
        return { rows: [{ organization_id: ORG }] };
      }

      if (sql.includes("from pg_proc")) {
        return {
          rows: [{
            names: ["p_code", "p_user", "p_write"],
            types: [25, 2950, 16],
            required: 3,
          }],
        };
      }

      if (sql.includes("select public.consumer_gateway_company_media")) {
        return {
          rows: [{
            result: { path: ORG + "/image.png", state: "pending" },
          }],
        };
      }

      return { rows: [] };
    },
    release() {
      released = true;
    },
  };

  return {
    store: createDemoStore({ connect: async () => client }),
    calls,
    released: () => released,
  };
}

test("HF02: gateway autorizado nao exige SET ROLE service_role", async () => {
  const f = fixture();
  const result = await f.store.mediaRPC(
    { organization_id: ORG, manager_id: MANAGER, consumer_id: CONSUMER },
    "consumer_gateway_company_media",
    { p_code: CODE, p_user: MANAGER, p_write: true },
  );

  assert.equal(result.state, "pending");
  assert.equal(f.released(), true);
  assert.equal(
    f.calls.some(x => /set\s+(local\s+)?role\s+service_role/i.test(x.sql)),
    false,
  );
  assert.equal(
    f.calls.some(x =>
      x.sql.includes("set_config('request.jwt.claims'") &&
      JSON.parse(x.params[0]).sub === MANAGER
    ),
    true,
  );
});

test("HF02: usuario estranho nao pode operar midia", async () => {
  const f = fixture();

  await assert.rejects(
    f.store.mediaRPC(
      { organization_id: ORG, manager_id: MANAGER, consumer_id: CONSUMER },
      "consumer_gateway_company_media",
      {
        p_code: CODE,
        p_user: "44444444-4444-4444-8444-444444444444",
        p_write: true,
      },
    ),
    /demo_scope_denied/,
  );

  assert.equal(
    f.calls.some(x => x.sql.includes("select public.consumer_gateway_company_media")),
    false,
  );
});

test("HF02: consumidor nao pode enviar midia empresarial", async () => {
  const f = fixture();

  await assert.rejects(
    f.store.mediaRPC(
      { organization_id: ORG, manager_id: MANAGER, consumer_id: CONSUMER },
      "consumer_gateway_company_media",
      { p_code: CODE, p_user: CONSUMER, p_write: true },
    ),
    /demo_scope_denied/,
  );
});
