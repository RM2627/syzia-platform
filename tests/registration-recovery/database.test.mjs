import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fixture } from "../stripe-online/fixture.mjs";
import { enterpriseAccess } from "../../server/enterprise-access.mjs";
let c, d, config, invite, uid;
const sha = (x) => createHash("sha256").update(x).digest("hex");
const sql = async (s, a = []) => (await c.rawSQL(s, a)).rows;
const call = (n, a = {}, who = "root") => c.asUser(who, n, a);
const expires = () => new Date(Date.now() + 86400000).toISOString();
const remember = (i) =>
  c.service("access_activation_remember", {
    p_hash: i.hash,
    p_email: "recipient@example.invalid",
  });
async function makeInvite(purpose = "activation") {
  const lead = (
    await call("commercial_contact_save", {
      p_id: null,
      p_revision: 0,
      p_key: randomUUID(),
      p_data: {
        name: "Aurora Interiores",
        email: "recipient@example.invalid",
        stage: "wants_trial",
      },
    })
  ).id;
  await call("commercial_contact_authorize", {
    p_id: lead,
    p_purpose: purpose,
    p_authorized: true,
    p_notice: "fixture",
    p_evidence: "Autorização fictícia somente nesta fixture.",
    p_expires: expires(),
  });
  await call("commercial_demo_link", { p_demo: d.id, p_lead: lead });
  const a = {
    p_id: randomUUID(),
    p_demo: d.id,
    p_lead: lead,
    p_purpose: purpose,
    p_hash: sha(randomUUID()),
    p_expires: expires(),
  };
  await call("commercial_invite_for_contact", a);
  return { id: a.p_id, hash: a.p_hash, lead };
}
before(async () => {
  c = await fixture();
  // Local fixture schema mirrors Auth's metadata column (no real Auth/SMTP is used).
  await sql(
    "alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb",
  );
  const migration = await readFile(
    "supabase/migrations/202611020070_registration_recovery.sql",
    "utf8",
  );
  await assert.rejects(
    c.db.exec(migration.replace(/commit;\s*$/, "select 1/0;commit;")),
    /division by zero/,
  );
  await c.db.exec("rollback");
  assert.equal(
    (
      await sql(
        "select to_regclass('private.registration_activation_contexts') v",
      )
    )[0].v,
    null,
  );
  await c.db.exec(migration);
  d = await call("commercial_demo_save", {
    p_id: null,
    p_revision: 0,
    p_key: randomUUID(),
    p_lead: null,
    p_name: "Aurora Interiores",
    p_slug: null,
    p_plan: null,
    p_expires: new Date(Date.now() + 14 * 86400000).toISOString(),
  });
  config = (
    await sql("select private.commercial_config_export($1) v", [c.orgs.A])
  )[0].v;
  const reviewed = await call("commercial_demo_draft", {
    p_id: d.id,
    p_revision: d.revision,
    p_config: config,
    p_review: true,
  });
  await call("commercial_demo_publish", {
    p_id: d.id,
    p_revision: reviewed.revision,
    p_config: config,
  });
  invite = await makeInvite();
  uid = randomUUID();
  c.users.recipient = uid;
  await sql(
    "insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values($1,'recipient@example.invalid',null,false,$2)",
    [
      uid,
      JSON.stringify({
        display_name: "Lia Costa",
        syzia_username: "lia.costa",
      }),
    ],
  );
});
after(async () => {
  await c?.db.close();
});
test('070 resend cooldown is durable across handlers/devices; concurrent requests send once', async()=>{
 let sent=0;
 const make=()=>enterpriseAccess({service:c.service,resendSignup:async()=>{sent++;return {error:null};}});
 const result=await Promise.allSettled([make()('/access/signup-confirmation',{email:'cooldown@example.invalid'},{ip:'fictional-A'}),make()('/access/signup-confirmation',{email:'cooldown@example.invalid'},{ip:'fictional-B'})]);
 assert.equal(sent,1);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(result.find(r=>r.status==='rejected').reason.message,'delivery_cooldown');
});
test("070 transactional failure rolls back, RLS/FORCE RLS and narrow grants preserved", async () => {
  const r = (
    await sql(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid='private.registration_activation_contexts'::regclass",
    )
  )[0];
  assert.equal(r.relrowsecurity, true);
  assert.equal(r.relforcerowsecurity, true);
  for (const role of ["anon", "authenticated"]) {
    const a = (
      await sql(
        "select has_table_privilege($1,'private.registration_activation_contexts','SELECT,INSERT,UPDATE,DELETE') direct,has_function_privilege($1,'public.access_activation_remember(text,text)','EXECUTE') remember,has_function_privilege($1,'public.access_registration_profile(uuid)','EXECUTE') profile",
        [role],
      )
    )[0];
    assert.deepEqual(a, { direct: false, remember: false, profile: false });
  }
  assert.equal(
    (
      await sql(
        "select has_function_privilege('anon','public.commercial_activation_pending()','EXECUTE') v",
      )
    )[0].v,
    false,
  );
});
test("070 remember valid invitation before signup, stable duplicate writes, no claim/org/trial creation", async () => {
  const baseline = await sql(
    "select (select count(*) from public.organizations) orgs,(select count(*) from private.trial_grants) trials,(select count(*) from private.billing047_contracts) contracts",
  );
  await Promise.all([remember(invite), remember(invite)]);
  assert.equal(
    (
      await sql(
        "select count(*)::int n from private.registration_activation_contexts",
      )
    )[0].n,
    1,
  );
  assert.equal(
    (await sql("select count(*)::int n from private.commercial_claims"))[0].n,
    0,
  );
  assert.deepEqual(
    await sql(
      "select (select count(*) from public.organizations) orgs,(select count(*) from private.trial_grants) trials,(select count(*) from private.billing047_contracts) contracts",
    ),
    baseline,
  );
});
test("070 no recovery for unconfirmed, wrong identity, invalid link or demo-purpose invitation", async () => {
  await assert.rejects(call("commercial_activation_pending", {}, "recipient"));
  await assert.rejects(
    c.service("access_registration_profile", { p_user: uid }),
    /user_not_eligible/,
  );
  assert.deepEqual(
    await call("commercial_activation_pending", {}, "adminB"),
    [],
  );
  await assert.rejects(
    call("commercial_activation_resume", { p_invite: invite.id }, "adminB"),
    /commercial_invite_invalid/,
  );
  await assert.rejects(
    c.service("access_activation_remember", {
      p_hash: invite.hash,
      p_email: "other@example.invalid",
    }),
    /registration_invitation_invalid/,
  );
  await assert.rejects(
    remember({ hash: sha("invalid") }),
    /registration_invitation_invalid/,
  );
  await assert.rejects(
    remember(await makeInvite("demonstration")),
    /registration_invitation_invalid/,
  );
});
test("070 name/username survive confirmation and subsequent metadata edits cannot overwrite registered identity", async () => {
  await sql("update auth.users set email_confirmed_at=now() where id=$1", [
    uid,
  ]);
  const profile = await c.service("access_registration_profile", {
    p_user: uid,
  });
  assert.equal(profile.name, "Lia Costa");
  assert.equal(profile.username, "lia.costa");
  assert.equal(profile.missing_name, false);
  assert.equal(profile.missing_username, false);
  await c.service("access_selfservice_identity", {
    p_user: uid,
    p_name: profile.name,
    p_username: profile.username,
  });
  await sql("update auth.users set raw_user_meta_data='{}' where id=$1", [uid]);
  assert.deepEqual(
    await c.service("access_registration_profile", { p_user: uid }),
    profile,
  );
});
test("070 new device resumes exact approved snapshot; two requests use one claim, no financial access", async () => {
  assert.deepEqual(
    await call("commercial_activation_pending", {}, "recipient"),
    [{ id: invite.id, company: "Aurora Interiores" }],
  );
  const [a, b] = await Promise.all([
    call("commercial_activation_resume", { p_invite: invite.id }, "recipient"),
    call("commercial_activation_resume", { p_invite: invite.id }, "recipient"),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.state, "approved");
  assert.equal(a.organization_id, null);
  assert.deepEqual(a.configuration, config);
  assert.equal(
    (
      await sql(
        "select count(*)::int n from private.commercial_claims where invite_id=$1",
        [invite.id],
      )
    )[0].n,
    1,
  );
  assert.equal(
    (
      await sql(
        "select count(*)::int n from public.organization_members where user_id=$1",
        [uid],
      )
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql("select count(*)::int n from private.commercial_claim_reviews")
    )[0].n,
    0,
  );
});
test("070 revocation/expiration/current recipient and claimed owner rechecked on resume", async () => {
  for (const [change, undo] of [
    ["revoked_at=now()", "revoked_at=null"],
    [
      "expires_at=now()-interval '1 second'",
      "expires_at=now()+interval '1 day'",
    ],
    ["claimed_by='" + c.users.adminB + "'", "claimed_by='" + uid + "'"],
  ]) {
    await sql(
      "update private.commercial_invites set " + change + " where id=$1",
      [invite.id],
    );
    await assert.rejects(
      call(
        "commercial_activation_resume",
        { p_invite: invite.id },
        "recipient",
      ),
      /commercial_invite_invalid/,
    );
    await sql(
      "update private.commercial_invites set " + undo + " where id=$1",
      [invite.id],
    );
  }
  await sql(
    "update private.acquisition_leads set email='other@example.invalid' where id=$1",
    [invite.lead],
  );
  await assert.rejects(
    call("commercial_activation_resume", { p_invite: invite.id }, "recipient"),
    /commercial_invite_invalid/,
  );
  await sql(
    "update private.acquisition_leads set email='recipient@example.invalid' where id=$1",
    [invite.lead],
  );
});
test("070 enforced invalid session cannot recover or claim; suspended identity rejected", async () => {
  await sql(
    "insert into private.access_enforced_users values($1) on conflict do nothing",
    [uid],
  );
  await assert.rejects(
    call("commercial_activation_pending", {}, "recipient"),
    /access_denied/,
  );
  await sql("delete from private.access_enforced_users where user_id=$1", [
    uid,
  ]);
  await sql("update public.profiles set status='suspended' where id=$1", [uid]);
  await assert.rejects(
    call("commercial_activation_pending", {}, "recipient"),
    /access_denied/,
  );
  await sql("update public.profiles set status='active' where id=$1", [uid]);
});

test('070 two independently authenticated sessions resume one claim; revoked session stays blocked',async()=>{
 const account=await c.service('access_selfservice_identity',{p_user:uid,p_name:'Lia Costa',p_username:'lia.costa'});
 const a=randomUUID(),b=randomUUID();
 for(const session of [a,b])assert.equal(await c.service('access_register_session',{p_user:uid,p_session:session,p_account:account.id,p_generation:account.generation}),true);
 const run=session=>c.tx('recipient',async()=>{
  await c.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,session_id:session,role:'authenticated'})]);
  return c.rpc('commercial_activation_resume',{p_invite:invite.id});
 });
 const results=await Promise.all([run(a),run(b)]);assert.equal(results[0].id,results[1].id);
 await sql('update private.enterprise_sessions set revoked=true where session_id=$1',[a]);
 await assert.rejects(run(a),/access_denied/);assert.equal((await run(b)).id,results[0].id);
 assert.equal(await c.service('access_register_session',{p_user:uid,p_session:a,p_account:account.id,p_generation:account.generation}),false);
});
