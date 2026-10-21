import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../billing-047/fixture.mjs";

test("HF02: destino ausente nunca gera PUT financeiro", async () => {
  const c = await fixture();

  try {
    await c.db.exec(await readFile("supabase/migrations/202610210057_billing_completed_change_recovery.sql", "utf8"));
    const initial = await c.command();
    const id = initial.subscription.id;

    await c.rawSQL(
      `UPDATE private.billing047_contracts
       SET operation = 'change',
           operation_state = 'uncertain',
           target_version = NULL,
           target_amount = NULL,
           target_code = NULL,
           target_requested_at = NULL,
           target_effective_at = NULL
       WHERE id = $1`,
      [id]
    );

    const countPUT = () => c.fake.calls.filter(
      x => x.method === "PUT" &&
           x.path.startsWith("/preapproval/")
    ).length;

    const before = countPUT();

    await assert.rejects(
      c.engine.process(id),
      /billing_reconciliation_required/
    );

    assert.equal(countPUT(), before,
      "Nao pode enviar PUT com destino invalido");

    const result = await c.rawSQL(
      `SELECT operation_state, target_amount
       FROM private.billing047_contracts
       WHERE id = $1`,
      [id]
    );

    assert.equal(result.rows[0].operation_state, "uncertain");
    assert.equal(result.rows[0].target_amount, null);
  } finally {
    await c.db.close();
  }
});
