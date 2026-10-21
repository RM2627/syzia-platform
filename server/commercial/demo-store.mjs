import { randomUUID, randomBytes, createHash } from "node:crypto";
import { validateDemoRPC, DENIED_ACTIONS } from "./demo-rpcs.mjs";
import { validateConfiguration } from "./configuration.mjs";
import { demonstrationProfile } from "./demo-profile.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const scalar = async (c, sql, args = []) =>
  Object.values((await c.query(sql, args)).rows[0] || {})[0];
// Pool interface is injected for local PostgreSQL/PGlite tests; no global credentials.
export function createDemoStore(
  pool,
  { sessionMinutes = 60, maxVisitors = 200, maxInstances = 1000 } = {},
) {
  async function transaction(fn) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local statement_timeout='15s'");
      await c.query("set local lock_timeout='3s'");
      const identity = await scalar(
        c,
        "select purpose from demo_private.identity where singleton and schema_version=55",
      );
      if (identity !== "syzia-commercial-demo-054")
        throw Error("demo_database_required");
      const value = await fn(c);
      await c.query("commit");
      return value;
    } catch (e) {
      try {
        await c.query("rollback");
      } catch {}
      throw e;
    } finally {
      c.release();
    }
  }
  async function call(c, name, args = {}) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw Error("demo_operation_denied");
    const candidates = (
      await c.query(
        "select proargnames names,proargtypes::oid[] types,pronargs-pronargdefaults required from pg_proc where pronamespace='public'::regnamespace and proname=$1",
        [name],
      )
    ).rows.filter(
      (m) =>
        Object.keys(args).every((k) => (m.names || []).includes(k)) &&
        (m.names || [])
          .slice(0, m.required)
          .every((k) => Object.hasOwn(args, k)),
    );
    if (candidates.length !== 1) throw Error("demo_rpc_contract_invalid");
    const m = candidates[0],
      names = (m.names || []).filter((k) => Object.hasOwn(args, k));
    const values = names.map((k) =>
      m.types[m.names.indexOf(k)] === 3802 ? JSON.stringify(args[k]) : args[k],
    );
    return scalar(
      c,
      `select public.${name}(${names.map((k, i) => `${k}=>$${i + 1}`).join(",")})`,
      values,
    );
  }
  async function as(c, user, anonymous = false) {
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, is_anonymous: anonymous }),
    ]);
    await c.query("set local role authenticated");
  }
  async function createPerson(c, name, anonymous = false) {
    const id = randomUUID();
    await c.query(
      "insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)values($1,$2,$3,$4,$5)",
      [
        id,
        id + "@demonstration.invalid",
        anonymous ? null : new Date(),
        anonymous,
        JSON.stringify({ display_name: name }),
      ],
    );
    await c.query("update profiles set display_name=$2 where id=$1", [
      id,
      name,
    ]);
    return id;
  }
  async function instance(c, definition, kind) {
    await c.query("select pg_advisory_xact_lock(734921554)");
    if (kind === "editor") {
      const old = (
        await c.query(
          "select *from demo_private.instances where source_id=$1 and generation=$2 and kind='editor'",
          [definition.id, definition.generation],
        )
      ).rows[0];
      if (old) {
        await c.query('update public.organizations set name=$2 where id=$1',[old.organization_id,definition.name]);
        await c.query(
          "update demo_private.instances set expires_at=$2 where id=$1",
          [old.id, new Date(Date.now() + sessionMinutes * 60000)],
        );
        return old;
      }
    }
    if (
      (await scalar(c, "select count(*)::int from demo_private.instances")) >=
      maxInstances
    )
      throw Error("demo_capacity_reached");
    const n = await scalar(
      c,
      "select count(*)::int from demo_private.instances where kind='visitor'and expires_at>clock_timestamp()",
    );
    if (n >= maxVisitors) throw Error("demo_capacity_reached");
    const id = randomUUID(),
      org = randomUUID(),
      manager = await createPerson(c, "Responsável demonstrativo"),
      consumer = await createPerson(c, "Visitante demonstrativo", true);
    const plan = definition.plan || demonstrationProfile;
    if (!plan?.id || plan.human_support) throw Error("demo_plan_invalid");
    // Mirror the immutable approved plan, without creating a subscription or trial.
    const planId = plan.plan_id;
    await c.query(
      "insert into billing_plans(id,name)values($1,$2)on conflict(id)do nothing",
      [planId, "Plano demonstrado"],
    );
    if (
      !(await scalar(
        c,
        "select exists(select 1 from billing_plan_versions where id=$1)",
        [plan.id],
      ))
    ) {
      const columns = Object.keys(plan).filter(
        (k) => !["created_by"].includes(k),
      );
      if (columns.some((k) => !/^[a-z_]+$/.test(k)))
        throw Error("demo_plan_invalid");
      await c.query(
        `insert into billing_plan_versions(${columns.join(",")})select ${columns.map((k) => "r." + k).join(",")} from jsonb_populate_record(null::billing_plan_versions,$1)r`,
        [JSON.stringify(plan)],
      );
    }
    await c.query("insert into organizations(id,name,slug)values($1,$2,$3)", [
      org,
      definition.name,
      "d-" + id,
    ]);
    await c.query(
      "update private.organization_verifications set required=false where organization_id=$1",
      [org],
    );
    await c.query(
      "insert into private.billing_plan_homologations(organization_id,plan_version_id,started_by,reason)values($1,$2,$3,'Demonstração isolada: sem assinatura, trial ou cobrança')",
      [org, plan.id, manager],
    );
    await c.query(
      "insert into organization_members(organization_id,user_id,role,is_attendant)values($1,$2,'admin_empresa',false)",
      [org, manager],
    );
    await c.query(
      "insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,role,state,requested_by,request_key)values($1,$2,'responsavel.demo','Responsável demonstrativo','responsavel@demonstration.invalid','admin_empresa','active',$2,$3)",
      [org, manager, randomUUID()],
    );
    await as(c, manager);
    await call(c, "company_initialize", { p_org: org });
    await c.query("reset role");
    if (definition.configuration) {
      const config = structuredClone(
        validateConfiguration(definition.configuration),
      );
      for (const media of config.tables.company_media || []) {
        const object = (
          await c.query(
            "select bytes,mime from demo_private.frozen_media where source_id=$1 and media_id=$2 and object_path=$3 and sha256=$4 union all select o.bytes,o.mime from company_media m join demo_private.instances i on i.organization_id=m.organization_id join demo_private.objects o on o.bucket='company-media'and o.path=m.object_path where i.source_id=$1 and i.kind='editor'and m.id=$2 and m.object_path=$3 and m.sha256=$4 and m.state='ready' limit 1",
            [definition.id, media.id, media.object_path, media.sha256],
          )
        ).rows[0];
        if (!object) throw Error("commercial_media_unavailable");
        if (
          Number(
            await scalar(
              c,
              "select coalesce(sum(octet_length(bytes)),0)::bigint from demo_private.objects",
            ),
          ) +
            object.bytes.length >
          128 * 1024 * 1024
        )
          throw Error("demo_capacity_reached");
        media.object_path = org + "/" + randomUUID();
        await c.query(
          "insert into demo_private.objects(bucket,path,bytes,mime)values('company-media',$1,$2,$3)",
          [media.object_path, object.bytes, object.mime],
        );
      }
      await c.query("select private.commercial_config_apply($1,$2,$3)", [
        org,
        JSON.stringify(config),
        manager,
      ]);
    }
    await c.query(
      "update company_settings set support_mode='own',support_configured=true where organization_id=$1",
      [org],
    );
    await c.query(
      "insert into demo_private.instances values($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())",
      [
        id,
        definition.id,
        definition.generation,
        kind,
        org,
        manager,
        consumer,
        new Date(Date.now() + sessionMinutes * 60000),
      ],
    );
    if (kind === "visitor") {
      await as(c, manager);
      const d = await call(c, "consumer_page_draft", {
        p_org: org,
        p_show_prices: true,
      });
      if (!d.ready) throw Error("demo_configuration_not_ready");
      await call(c, "consumer_publish_draft", {
        p_org: org,
        p_token: d.token,
        p_show_prices: true,
        p_expected_revision: d.page_revision,
      });
      await c.query("reset role");
    }
    return {
      id,
      source_id: definition.id,
      generation: definition.generation,
      kind,
      organization_id: org,
      manager_id: manager,
      consumer_id: consumer,
    };
  }
  async function resolve(c, token, definition) {
    const r = (
      await c.query(
        "select i.*,s.actor_id,s.expires_at session_expires from demo_private.sessions s join demo_private.instances i on i.id=s.instance_id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>clock_timestamp()",
        [hash(token || "")],
      )
    ).rows[0];
    if (
      !r ||
      r.source_id !== definition.id ||
      r.generation !== definition.generation
    )
      throw Error("demo_session_expired");
    return r;
  }
  return {
    transaction,
    call,
    async freeze(sourceId, configuration) {
      return transaction(async c => {
        for(const media of validateConfiguration(configuration).tables.company_media || []) {
          const item=(await c.query("select o.bytes,o.mime from company_media m join demo_private.instances i on i.organization_id=m.organization_id join demo_private.objects o on o.bucket='company-media'and o.path=m.object_path where i.source_id=$1 and i.kind='editor'and m.id=$2 and m.object_path=$3 and m.sha256=$4 and m.state='ready'",[sourceId,media.id,media.object_path,media.sha256])).rows[0];
          if(!item || hash(Buffer.from(item.bytes))!==media.sha256 || item.mime!==media.mime)throw Error('commercial_media_invalid');
          const exists=await scalar(c,"select exists(select 1 from demo_private.frozen_media where source_id=$1 and media_id=$2 and object_path=$3 and sha256=$4)",[sourceId,media.id,media.object_path,media.sha256]);
          if(!exists) {
            const size=Number(await scalar(c,"select coalesce(sum(octet_length(bytes)),0)from demo_private.frozen_media"));
            if(size+item.bytes.length>128*1024*1024)throw Error('demo_capacity_reached');
            await c.query("insert into demo_private.frozen_media(source_id,media_id,object_path,sha256,mime,bytes)values($1,$2,$3,$4,$5,$6)",[sourceId,media.id,media.object_path,media.sha256,item.mime,item.bytes]);
          }
        }
      });
    },
    async cleanup() {
      return transaction(async c => {
        await c.query("delete from demo_private.sessions where expires_at<clock_timestamp() or revoked_at is not null");
        await c.query("delete from demo_private.objects o using demo_private.instances i where i.kind='visitor'and i.expires_at<clock_timestamp()and o.path like i.organization_id::text||'/%'");
        await c.query("update public.organizations o set status='suspended'from demo_private.instances i where i.organization_id=o.id and i.kind='visitor'and i.expires_at<clock_timestamp()and o.status='active'");
      });
    },
    async begin(definition, kind = "visitor", actor = null) {
      return transaction(async (c) => {
        const i = await instance(c, definition, kind);
        const token =
            "demo." +
            Buffer.from(JSON.stringify({ session_id: randomUUID() })).toString(
              "base64url",
            ) +
            "." +
            randomBytes(32).toString("base64url"),
          expires = new Date(
            Math.min(
              Date.now() + sessionMinutes * 60000,
              new Date(definition.expires_at).getTime(),
            ),
          );
        await c.query(
          "insert into demo_private.sessions(token_hash,instance_id,kind,actor_id,expires_at)values($1,$2,$3,$4,$5)",
          [hash(token), i.id, kind, actor, expires],
        );
        return {
          token,
          expires_at: expires.toISOString(),
          organization: {
            id: i.organization_id,
            name: definition.name,
            slug: definition.slug,
            status: "active",
          },
          source_id: definition.id,
          slug: definition.slug,
          kind,
          personas: { company: i.manager_id, consumer: i.consumer_id },
        };
      });
    },
    async restore(token, definition) {
      return transaction(async (c) => {
        const s = await resolve(c, token, definition);
        return {
          token,
          expires_at: s.session_expires,
          organization: {
            id: s.organization_id,
            name: definition.name,
            slug: definition.slug,
            status: "active",
          },
          source_id: definition.id,
          slug: definition.slug,
          kind: s.kind,
          personas: { company: s.manager_id, consumer: s.consumer_id },
        };
      });
    },
    async session(token) {
      return transaction(
        async (c) =>
          (
            await c.query(
              "select i.source_id,i.kind,s.actor_id from demo_private.sessions s join demo_private.instances i on i.id=s.instance_id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>clock_timestamp()",
              [hash(token || "")],
            )
          ).rows[0] || null,
      );
    },
    async rpc(token, definition, perspective, name, args) {
      return transaction(async (c) => {
        const s = await resolve(c, token, definition);
        validateDemoRPC(perspective, name, args, s);
        const consumer = perspective === "consumer";
        if (Object.hasOwn(args, "p_slug"))
          args = { ...args, p_slug: "d-" + s.id };
        await as(c, consumer ? s.consumer_id : s.manager_id, consumer);
        let result = await call(c, name, args);
        if (name === "permissions_context") {
          for (const [action, value] of Object.entries(result.actions || {}))
            if (action.startsWith("finance.") || DENIED_ACTIONS.has(action))
              value.allowed = false;
          delete result.homologation;
        }
        if (name === "consumer_public_page")
          result = { ...result, slug: definition.slug };
        return result;
      });
    },
    async export(token, definition, {requireReady = true} = {}) {
      return transaction(async (c) => {
        const s = await resolve(c, token, definition);
        if (s.kind !== "editor") throw Error("demo_operation_denied");
        await as(c, s.manager_id);
        const d = await call(c, "consumer_page_draft", {
          p_org: s.organization_id,
          p_show_prices: true,
        });
        if (requireReady && !d.ready) throw Error("demo_configuration_not_ready");
        await c.query("reset role");
        return validateConfiguration(
          await scalar(c, "select private.commercial_config_export($1)", [
            s.organization_id,
          ]),
        );
      });
    },
    async team(token, definition, data) {
      return transaction(async (c) => {
        const s = await resolve(c, token, definition);
        if (!data)
          return (
            await c.query(
              "select p.id,p.display_name,m.role,m.status from organization_members m join profiles p on p.id=m.user_id where m.organization_id=$1",
              [s.organization_id],
            )
          ).rows;
        if (
          typeof data.name !== "string" ||
          data.name.trim().length < 2 ||
          data.name.length > 80 ||
          !["admin_empresa", "colaborador_empresa", "own_attendant"].includes(
            data.role,
          ) ||
          Object.keys(data).some((k) => !["name", "role"].includes(k))
        )
          throw Error("demo_person_invalid");
        const person = await createPerson(c, data.name);
        await as(c, s.manager_id);
        await c.query("reset role");
        await c.query("select private.billing_assert_capacity($1,'members')", [
          s.organization_id,
        ]);
        await c.query(
          "insert into organization_members(organization_id,user_id,role,is_attendant)values($1,$2,$3,$4)",
          [
            s.organization_id,
            person,
            data.role === "own_attendant" ? "colaborador_empresa" : data.role,
            data.role === "own_attendant",
          ],
        );
        return { id: person };
      });
    },
    async end(token) {
      return transaction((c) =>
        c.query(
          "update demo_private.sessions set revoked_at=clock_timestamp()where token_hash=$1",
          [hash(token || "")],
        ),
      );
    },

    async mediaContext(token, definition) {
      return transaction(async (c) => {
        const s = await resolve(c, token, definition);
        return s;
      });
    },
    async publicMediaContext(code) {
      return transaction(
        async (c) =>
          (
            await c.query(
              "select i.*from company_media m join demo_private.instances i on i.organization_id=m.organization_id where m.public_code=$1 and i.expires_at>clock_timestamp()",
              [code],
            )
          ).rows[0] || null,
      );
    },
    async mediaRPC(session, name, args) {
      return transaction(async (c) => {
        const allowed = new Set([
          "consumer_gateway_company_media",
          "consumer_gateway_attachment",
          "consumer_gateway_download",
          "consumer_finalize_company_media",
          "consumer_finalize_attachment",
          "consumer_gateway_public_media",
        ]);
        if (!allowed.has(name)) throw Error("demo_operation_denied");
        const table = args.p_code?.startsWith("m_")
          ? "company_media"
          : "attachments";
        const org = await scalar(
          c,
          `select organization_id from public.${table} where public_code=$1`,
          [args.p_code],
        );
        if (org !== session.organization_id) throw Error("demo_scope_denied");
        // The Neon connection owner cannot SET ROLE service_role. The media
        // RPCs are SECURITY DEFINER and enforce their own tenant authorization.
        // Bind the verified demo actor to this transaction before invoking them.
        const actor = args.p_user;
        if (name !== "consumer_gateway_public_media") {
          if (actor !== session.manager_id && actor !== session.consumer_id)
            throw Error("demo_scope_denied");
          if (name.endsWith("company_media") && actor !== session.manager_id)
            throw Error("demo_scope_denied");
          await c.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: actor, is_anonymous: actor === session.consumer_id }),
          ]);
        }
        return call(c, name, args);
      });
    },
    async preparedMedia(sourceId, media) {
      return transaction(async (c) => {
        const item = (
          await c.query(
            "select bytes,mime from demo_private.frozen_media where source_id=$1 and media_id=$2 and object_path=$3 and sha256=$4 union all select o.bytes,o.mime from company_media m join demo_private.instances i on i.organization_id=m.organization_id join demo_private.objects o on o.bucket='company-media'and o.path=m.object_path where i.source_id=$1 and i.kind='editor'and m.id=$2 and m.object_path=$3 and m.sha256=$4 and m.state='ready' limit 1",
            [sourceId, media.id, media.object_path, media.sha256],
          )
        ).rows[0];
        if (!item) throw Error("commercial_media_unavailable");
        return item;
      });
    },
    async mediaObject(bucket, path, data, mime) {
      return transaction(async (c) => {
        if (!["company-media", "consumer-private"].includes(bucket))
          throw Error("demo_scope_denied");
        if (
          data &&
          !(await scalar(
            c,
            "select exists(select 1 from demo_private.objects where bucket=$1 and path=$2)",
            [bucket, path],
          ))
        ) {
          const n = await scalar(
            c,
            "select coalesce(sum(octet_length(bytes)),0)::bigint from demo_private.objects",
          );
          if (Number(n) + data.length > 128 * 1024 * 1024)
            throw Error("demo_capacity_reached");
          await c.query(
            "insert into demo_private.objects(bucket,path,bytes,mime)values($1,$2,$3,$4)on conflict do nothing",
            [bucket, path, data, mime],
          );
        }
        const item = (
          await c.query(
            "select bytes,mime from demo_private.objects where bucket=$1 and path=$2",
            [bucket, path],
          )
        ).rows[0];
        if (!item) throw Error("storage_unavailable");
        return item;
      });
    },
    async close() {
      await pool.end();
    },
  };
}
