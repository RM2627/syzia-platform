// Local fixture only. No CPF, residential address or real operator identity.
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { inspectSQL } from "../../scripts/legal-050/sql.mjs";
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export async function snapshot(db) {
  await db.exec("SET TIME ZONE 'UTC'");
  // Keep the exact inspection query; strip only transaction wrapper for fixture callers.
  const query = inspectSQL.slice(
    inspectSQL.indexOf("SELECT jsonb_build_object"),
    inspectSQL.lastIndexOf("COMMIT;"),
  );
  return (await db.query(query)).rows[0].legal_snapshot;
}
export async function fixtureDocuments(
  version = "local-050-v1",
  group = "local-050-material-v1",
) {
  return Promise.all(
    [
      ["terms", "TERMOS-DE-USO-REVISADOS.md", "Termos de Uso"],
      [
        "privacy",
        "POLITICA-DE-PRIVACIDADE-REVISADA.md",
        "Política de Privacidade",
      ],
    ].map(async ([kind, file, title]) => ({
      kind,
      version,
      acceptance_version: group,
      title,
      body: (await readFile("docs/hotfix-050/" + file, "utf8"))
        .replace(/^# .*\n+/, "")
        .replace(/^## /gm, "")
        .trim(),
    })),
  );
}
export async function provision(c, org = null, role = "admin_empresa") {
  const { db, rpc, as } = c;
  await db.exec("begin");
  if (org) {
    const { authorizeSupport } =
      await import("../support/authorized-support.mjs");
    const owner = (
      await db.query(
        "select user_id from public.organization_members where organization_id=$1 and role='admin_empresa' and status='active' limit 1",
        [org],
      )
    ).rows[0].user_id;
    await authorizeSupport(c, org, owner);
  }
  await as("root");
  const a = await rpc("access_reserve", {
    p_org: org,
    p_name: "Organização de ensaio jurídico",
    p_slug: "juridico-" + randomUUID(),
    p_display: "Administrador de ensaio",
    p_username: "juridico." + randomUUID().slice(0, 8),
    p_email: randomUUID() + "@example.invalid",
    p_phone: "",
    p_role: role,
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false) on conflict do nothing",
    [a.user_id, a.user_id + "@example.invalid"],
  );
  const root = (
    await db.query(
      "select user_id from platform_roles where role='super_admin' limit 1",
    )
  ).rows[0].user_id;
  const code = await rpc("access_finish_provision", {
    p_id: a.id,
    p_actor: root,
    p_hash: hash("local-code"),
  });
  const account = { ...a, ...code };
  await rpc("access_verify_code", {
    p_code: account.company_code,
    p_username: account.username,
    p_hash: hash("local-code"),
    p_proof: hash(a.id),
  });
  const begin = await rpc("access_begin_activation", { p_proof: hash(a.id) });
  await rpc("access_finish_activation", {
    p_id: a.id,
    p_operation: begin.operation,
    p_success: true,
  });
  const lookup = await rpc("access_lookup", {
    p_code: account.company_code,
    p_username: account.username,
  });
  const session = randomUUID();
  await rpc("access_register_session", {
    p_user: a.user_id,
    p_session: session,
    p_account: a.id,
    p_generation: lookup.generation,
  });
  await db.exec("commit");
  return { ...account, session };
}
export async function identity(db, account) {
  await db.exec("begin");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: account.user_id,
      session_id: account.session,
      is_anonymous: false,
    }),
  ]);
  await db.exec("set local role authenticated");
}
export async function accept(c, a, version = "draft-2026-09-19") {
  await identity(c.db, a);
  try {
    await c.rpc("access_legal_accept", {
      p_terms: version,
      p_privacy: version,
    });
    await c.db.exec("commit");
  } catch (e) {
    await c.db.exec("rollback;reset role");
    throw e;
  }
}
