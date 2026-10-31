import { createClient } from "@supabase/supabase-js";
import { academyController } from "./controller.mjs";
import { academyMailer } from "./mail.mjs";
import { createAcademyHandler } from "./http.mjs";
function exact(v, production) {
  const u = new URL(v);
  if (
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    !["http:", "https:"].includes(u.protocol) ||
    (production && u.protocol !== "https:")
  )
    throw Error("academy_configuration");
  return u.origin;
}
export function academyRuntime(
  env = process.env,
  {
    createClientImpl = createClient,
    transport,
    log = (r) => console.log(JSON.stringify(r)),
  } = {},
) {
  if (env.ACADEMY_ENABLED !== "true") return null;
  const production = env.NODE_ENV === "production",
    origin = exact(env.ACADEMY_PUBLIC_ORIGIN, production),
    adminOrigin = exact(env.PLATFORM_APP_ORIGIN, production);
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const client = createClientImpl(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    options,
  );
  const rpc = async (c, name, action, data) => {
    const r = await c.rpc(name, { p_action: action, p_data: data });
    if (r.error) throw r.error;
    return r.data;
  };
  const service = (a, d) =>
    rpc(
      client,
      a === "delivery_finish" || a.startsWith("mail_test_")
        ? "academy_mail_service"
        : "academy_service",
      a,
      d,
    );
  const asUser = (token, a, d) =>
    rpc(
      createClientImpl(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        ...options,
        global: { headers: { Authorization: "Bearer " + token } },
      }),
      a === "overview" || a.startsWith("mail_test_")
        ? "academy_mail_admin"
        : "academy_admin",
      a,
      d,
    );
  const bucket = client.storage.from("syzia-academy");
  const privateBucket = async () => {
    const r = await client.storage.getBucket("syzia-academy");
    if (r.error || !r.data || r.data.public)
      throw Error("academy_storage_unavailable");
  };
  const storage = {
    put: async (path, bytes, mime) => {
      await privateBucket();
      const r = await bucket.upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (r.error) throw Error("academy_storage_unavailable");
    },
    get: async (path) => {
      await privateBucket();
      const r = await bucket.download(path);
      if (r.error) throw Error("academy_storage_unavailable");
      return Buffer.from(await r.data.arrayBuffer());
    },
    remove: async (path) => {
      const r = await bucket.remove([path]);
      if (r.error) throw Error("academy_storage_unavailable");
    },
  };
  const dailyLimit = Number(env.ACADEMY_MAIL_DAILY_LIMIT || 80),
    monthlyLimit = Number(env.ACADEMY_MAIL_MONTHLY_LIMIT || 2400);
  if (
    !Number.isInteger(dailyLimit) ||
    dailyLimit < 1 ||
    dailyLimit > 1000 ||
    !Number.isInteger(monthlyLimit) ||
    monthlyLimit < 1 ||
    monthlyLimit > 30000
  )
    throw Error("academy_configuration");
  const mailEnabled =
    env.ACADEMY_MAIL_ENABLED === "true" &&
    env.ACCESS_MAIL_ENABLED === "true" &&
    !!env.ACCESS_SMTP_HOST &&
    !!env.ACCESS_SMTP_USER &&
    !!env.ACCESS_SMTP_PASSWORD &&
    !!env.ACCESS_MAIL_FROM;
  const controller = academyController({
    service,
    asUser,
    storage,
    send: academyMailer(env, transport),
    origin,
    secret: env.ACADEMY_SECRET,
    mailEnabled,
    dailyLimit,
    monthlyLimit,
    mailIntervalMs: 1000,
    log,
  });
  return {
    handler: createAcademyHandler({
      controller,
      origin,
      adminOrigin,
      production,
      trustProxy: env.ACADEMY_TRUST_PROXY === "true",
      log,
    }),
    close: controller.close,
  };
}
