import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";

test("HF identidade: reproduzir conflito de contexto na mesma sessao", async () => {
  const c = await fixture();

  try {
    await c.db.exec(
      await (await import("node:fs/promises")).readFile(
        "supabase/migrations/202610220059_personal_session_completion.sql",
        "utf8"
      )
    );

    const user = randomUUID();
    const session = randomUUID();

    await c.rawSQL(
      `INSERT INTO auth.users(id,email,email_confirmed_at)
       VALUES($1,$2,now())`,
      [user, `${user}@example.invalid`]
    );

    const account = await c.service("access_selfservice_identity", {
      p_user: user,
      p_name: "Cliente Teste",
      p_username: "teste." + user.replaceAll("-", "").slice(0, 12)
    });

    const first = await c.service("access_register_session", {
      p_user: user,
      p_session: session,
      p_account: null,
      p_generation: null
    });

    const second = await c.service("access_complete_personal_session", {
      p_user: user,
      p_session: session,
      p_account: account.id,
      p_generation: account.generation
    });

    const foreignUser = randomUUID();

    await c.rawSQL(
      `INSERT INTO auth.users(id,email,email_confirmed_at)
       VALUES($1,$2,now())`,
      [foreignUser, `${foreignUser}@example.invalid`]
    );

    const foreign = await c.service("access_complete_personal_session", {
      p_user: foreignUser,
      p_session: session,
      p_account: account.id,
      p_generation: account.generation
    });

    assert.equal(foreign, false, "Outro usuario nao pode assumir a sessao");

    await c.rawSQL(
      `UPDATE private.enterprise_sessions
       SET revoked=true WHERE session_id=$1`,
      [session]
    );

    const revoked = await c.service("access_complete_personal_session", {
      p_user: user,
      p_session: session,
      p_account: account.id,
      p_generation: account.generation
    });

    assert.equal(revoked, false, "Sessao revogada deve permanecer bloqueada");
    const expiredSession = randomUUID();

    await c.rawSQL(
      `INSERT INTO private.enterprise_sessions
       (session_id,user_id,account_id,generation,last_activity)
       VALUES($1,$2,NULL,NULL,now()-interval '30 days')`,
      [expiredSession, user]
    );

    const expired = await c.service("access_complete_personal_session", {
      p_user: user,
      p_session: expiredSession,
      p_account: account.id,
      p_generation: account.generation
    });

    assert.equal(expired, false, "Sessao expirada deve ser rejeitada");
    console.log("HF_IDENTITY_DIAGNOSTIC", {
      first,
      second,
      sameUser: true
    });

    assert.equal(first, true);
    assert.equal(
      second,
      true,
      "Sessao valida do mesmo usuario deve permitir selecionar identidade pessoal"
    );
  } finally {
    await c.db.close();
  }
});
