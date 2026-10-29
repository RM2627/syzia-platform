import { createClient } from "@supabase/supabase-js";
import { createInsightsHandler } from "./http.mjs";
export function insightsRuntime(
  env = process.env,
  {
    createClientImpl = createClient,
    log = (r) => console.log(JSON.stringify(r)),
  } = {},
) {
  if (env.INSIGHTS_ENABLED !== "true") return null;
  const origin = new URL(env.INSIGHTS_PUBLIC_ORIGIN),
    admin = new URL(env.PLATFORM_APP_ORIGIN);
  if (
    env.NODE_ENV === "production" &&
    (origin.protocol !== "https:" || admin.protocol !== "https:")
  )
    throw Error("insights_origin_invalid");
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
  const service = async (action, data) => {
    const r = await client.rpc("insights_service", {
      p_action: action,
      p_data: data,
    });
    if (r.error) throw r.error;
    return r.data;
  };
  const asUser = async (token, action, data) => {
    const c = createClientImpl(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { ...options, global: { headers: { Authorization: "Bearer " + token } } },
    );
    const r = await c.rpc("insights_editor", {
      p_action: action,
      p_data: data,
    });
    if (r.error) throw r.error;
    return r.data;
  };
  const resolveIdentity = async (token) => {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return null;
    const scoped = createClientImpl(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { ...options, global: { headers: { Authorization: "Bearer " + token } } },
    );
    const session = await scoped.rpc("access_session", {
      p_activity: false,
      p_logout: false,
    });
    return session.error ? null : data.user.id;
  };
  const handler = createInsightsHandler({
    service,
    asUser,
    resolveIdentity,
    authStorageKey:
      "sb-" + new URL(env.SUPABASE_URL).hostname.split(".")[0] + "-auth-token",
    origin: origin.origin,
    adminOrigin: admin.origin,
    secret: env.INSIGHTS_COOKIE_SECRET,
  });
  let timer,
    running,
    closed = false;
  const run = () =>
    (running ||= (async () => {
      try {
        const r = await service("tick", {});
        log({
          event: "insights_schedule",
          published: r.published,
          failed: r.failed,
        });
      } catch {
        log({ event: "insights_schedule_unavailable" });
      } finally {
        running = null;
        if (!closed) {
          timer = setTimeout(run, 60000);
          timer.unref();
        }
      }
    })());
  timer = setTimeout(run, 1000);
  timer.unref();
  return {
    handler,
    run,
    close: async () => {
      closed = true;
      clearTimeout(timer);
      await running;
    },
  };
}
