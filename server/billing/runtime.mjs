import { createClient } from "@supabase/supabase-js";
import { MercadoPagoSubscriptions } from "./mercado-pago.mjs";
import { subscriptions } from "./subscriptions.mjs";
export function billingRuntime(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.PLATFORM_APP_ORIGIN) throw Error("billing_server_environment_missing");
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  const service = async (name, args) => { const { data, error } = await client.rpc(name, args); if (error) throw error; return data; };
  const asUser = async (token, name, args) => {
    if (!token) throw Error("access_denied");
    const scoped = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { ...options, global: { headers: { Authorization: "Bearer " + token } } });
    const { data, error } = await scoped.rpc(name, args); if (error) throw error; return data;
  };
  const gateway = env.MERCADO_PAGO_ENABLED === "true" ? new MercadoPagoSubscriptions({
    accessToken: env.MERCADO_PAGO_ACCESS_TOKEN, publicKey: env.MERCADO_PAGO_PUBLIC_KEY,
    collectorId: env.MERCADO_PAGO_COLLECTOR_ID, applicationId: env.MERCADO_PAGO_APPLICATION_ID,
    appOrigin: env.PLATFORM_APP_ORIGIN, notificationUrl: env.MERCADO_PAGO_NOTIFICATION_URL,
    notificationAuth: env.MERCADO_PAGO_NOTIFICATION_AUTH || "resource_lookup", webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
  }) : null;
  const auth = async token => { if (!token) return null; const { data, error } = await client.auth.getUser(token); return error ? null : data.user; };
  return { billing: subscriptions({ gateway, service, asUser, auth }), gateway, service };
}
