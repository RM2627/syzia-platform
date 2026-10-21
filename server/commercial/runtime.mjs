import { assetPromoter } from "./promote-assets.mjs";
import { createDemoMediaHandler } from "./media.mjs";
import { createClient } from "@supabase/supabase-js";
import { demoOrigins } from "./links.mjs";
import { createDemoStore } from "./demo-store.mjs";
import { commercialController } from "./controller.mjs";
import { createCommercialMailer } from "./mail.mjs";
import { secretBox } from "./crypto.mjs";

// Only fixed classifications are logged; never messages, details or identifiers.
const recoveryCodes = new Set([
  "42702", "42501", "42P01", "42883", "PGRST202", "PGRST301",
  "57014", "55P03", "08006", "28P01", "ECONNREFUSED", "ETIMEDOUT",
]);
export async function commercialRecoveryCycle({ controller, store, log = (r) => console.warn(JSON.stringify(r)) }) {
  try {
    const results = await controller.reconcile();
    if (results.some((x) => x.error)) log({ event: "commercial_reconciliation_pending", stage: "materialization_reconcile" });
  } catch (error) {
    log({ event: "commercial_reconciliation_unavailable", stage: "materialization_reconcile", code: recoveryCodes.has(error?.code) ? error.code : "unclassified" });
  }
  // Cleanup is independent; a failed operational RPC must not starve demo expiry.
  try {
    await store.cleanup();
  } catch (error) {
    log({ event: "commercial_reconciliation_unavailable", stage: "demo_cleanup", code: recoveryCodes.has(error?.code) ? error.code : "unclassified" });
  }
}
export async function commercialRuntime(env = process.env) {
  if (env.COMMERCIAL_ENABLED !== "true") return null;
  const origins = demoOrigins(env);
  if (env.DEMO_DATABASE_PURPOSE !== "syzia-commercial-demo-054")
    throw Error("demo_database_required");
  const connection = new URL(env.DEMO_DATABASE_URL || "");
  if (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    connection.hostname === new URL(env.SUPABASE_URL).hostname
  )
    throw Error("demo_separate_database_required");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: connection.href,
    max: 4,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
  const sessionMinutes = Number(env.DEMO_SESSION_MINUTES || 60),
    maxVisitors = Number(env.DEMO_MAX_VISITORS || 200),
    maxInstances = Number(env.DEMO_MAX_INSTANCES || 1000);
  if (
    !Number.isInteger(sessionMinutes) ||
    sessionMinutes < 10 ||
    sessionMinutes > 240 ||
    !Number.isInteger(maxVisitors) ||
    maxVisitors < 1 ||
    maxVisitors > 500 ||
    !Number.isInteger(maxInstances) ||
    maxInstances < maxVisitors ||
    maxInstances > 5000
  ) {
    await pool.end();
    throw Error("demo_configuration_invalid");
  }
  const store = createDemoStore(pool, {
    sessionMinutes,
    maxVisitors,
    maxInstances,
  });
  try {
    await store.transaction(async () => {});
  } catch (e) {
    await store.close();
    throw e;
  } // fail closed on an operational or uninitialized database
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const client = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    options,
  );
  const service = async (name, args) => {
    const r = await client.rpc(name, args);
    if (r.error) throw r.error;
    return r.data;
  };
  const asUser = async (token, name, args) => {
    const c = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      ...options,
      global: { headers: { Authorization: "Bearer " + token } },
    });
    const r = await c.rpc(name, args);
    if (r.error) throw r.error;
    return r.data;
  };
  const auth = async (token) => {
    if (!token || token.startsWith("demo.")) return null;
    const r = await client.auth.getUser(token);
    return r.error ? null : r.data.user;
  };
  const maxBatch = Number(env.COMMERCIAL_BATCH_LIMIT || 25),
    inviteDays = Number(env.COMMERCIAL_INVITE_DAYS || 7);
  if (
    !Number.isInteger(maxBatch) ||
    maxBatch < 1 ||
    maxBatch > 100 ||
    !Number.isInteger(inviteDays) ||
    inviteDays < 1 ||
    inviteDays > 30
  )
    throw Error("commercial_configuration_invalid");
  const box = env.COMMERCIAL_LINK_ENCRYPTION_KEY
    ? secretBox(env.COMMERCIAL_LINK_ENCRYPTION_KEY)
    : null;
  if (
    env.COMMERCIAL_MAIL_ENABLED === "true" &&
    (!box || !env.COMMERCIAL_CONTACT_EMAIL)
  )
    throw Error("commercial_encryption_required");
  const controller = commercialController({
    asUser,
    service,
    auth,
    store,
    sendMail: createCommercialMailer(env),
    box,
    origins,
    contact: env.COMMERCIAL_CONTACT_EMAIL,
    maxBatch,
    inviteDays,
    promoteAssets: assetPromoter({ store, storage: client.storage }),
  });
  let recovery = null;
  const timer = setInterval(() => {
    if(recovery) return;
    recovery=commercialRecoveryCycle({controller,store}).finally(()=>{recovery=null;});
  },60000);
  timer.unref();
  return {
    controller,
    origins,
    media: createDemoMediaHandler({
      store,
      controller,
      origins,
      resolvePublic: (id) =>
        service("commercial_service", { p_action: "demo", p_data: { id } }),
    }),
    close: async () => {
      clearInterval(timer);
      if(recovery)await recovery;
      await controller.close();
      await store.close();
    },
  };
}
