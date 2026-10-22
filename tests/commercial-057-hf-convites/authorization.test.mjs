import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fixture } from "../billing-047/fixture.mjs";

test("HF: autorizacao sem evidencia respeita finalidade e email", async () => {
  const c = await fixture();

  try {
    await c.db.exec(
      await readFile(
        "supabase/migrations/202610180054_commercial_preparation.sql",
        "utf8"
      )
    );

    await c.db.exec(
      await readFile(
        "supabase/migrations/202610200055_commercial_versions.sql",
        "utf8"
      )
    );

    await c.db.exec(
      await readFile(
        "supabase/migrations/202610210056_commercial_preregistration.sql",
        "utf8"
      )
    );

    const lead = (
      await c.asUser("root", "commercial_contact_save", {
        p_id: null,
        p_revision: 0,
        p_key: randomUUID(),
        p_data: {
          name: "Cliente Teste",
          email: "cliente@example.invalid",
          stage: "wants_trial"
        }
      })
    ).id;

    await c.asUser("root", "commercial_contact_authorize", {
      p_id: lead,
      p_purpose: "activation",
      p_authorized: true,
      p_notice: "commercial-v1",
      p_evidence: "Declaracao do operador: confirmou autorizacao de contato",
      p_expires: new Date(Date.now() + 30 * 86400000).toISOString()
    });

    const result = await c.rawSQL(
      `SELECT purpose, authorized, evidence
       FROM private.commercial_authorizations
       WHERE lead_id=$1`,
      [lead]
    );

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].purpose, "activation");
    assert.equal(result.rows[0].authorized, true);
    assert.equal(result.rows[0].evidence, "Declaracao do operador: confirmou autorizacao de contato");

    const allowed = await c.rawSQL(
      `SELECT private.commercial_mail_eligible($1::uuid,$2::text) AS allowed`,
      [lead, "activation"]
    );

    assert.equal(allowed.rows[0].allowed, true);

    const otherPurpose = await c.rawSQL(
      `SELECT private.commercial_mail_eligible($1::uuid,$2::text) AS allowed`,
      [lead, "demonstration"]
    );

    assert.equal(otherPurpose.rows[0].allowed, false);

  } finally {
    await c.db.close();
  }
});
