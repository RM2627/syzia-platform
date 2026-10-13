import { createClient } from "@supabase/supabase-js";
import { MercadoPagoSubscriptions, fail } from "./mercado-pago.mjs";
import { subscriptions } from "./subscriptions.mjs";
import { notificationObserver } from "./notification-observer.mjs";
export function billingRuntime(env = process.env, { createClientImpl = createClient, fetchImpl = globalThis.fetch } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.PLATFORM_APP_ORIGIN) throw Error("billing_server_environment_missing");
  const enabled = env.MERCADO_PAGO_ENABLED === "true";
  const notificationMode = env.MERCADO_PAGO_NOTIFICATION_MODE || "disabled";
  if (!["disabled", "observe"].includes(notificationMode) || (enabled && notificationMode === "observe"))
    fail("billing_configuration_invalid", 503);
  const observe = notificationMode === "observe";
  if (observe && (env.BILLING_PROVIDER !== "mercado_pago" || !env.MERCADO_PAGO_WEBHOOK_SECRET))
    fail("billing_configuration_invalid", 503);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const client = createClientImpl(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  const service = async (name, args) => { const { data, error } = await client.rpc(name, args); if (error) throw error; return data; };
  const asUser = async (token, name, args) => {
    if (!token) throw Error("access_denied");
    const scoped = createClientImpl(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { ...options, global: { headers: { Authorization: "Bearer " + token } } });
    const { data, error } = await scoped.rpc(name, args); if (error) throw error; return data;
  };
  const gateway = enabled || observe ? new MercadoPagoSubscriptions({
    accessToken: env.MERCADO_PAGO_ACCESS_TOKEN, publicKey: env.MERCADO_PAGO_PUBLIC_KEY,
    collectorId: env.MERCADO_PAGO_COLLECTOR_ID, applicationId: env.MERCADO_PAGO_APPLICATION_ID,
    appOrigin: env.PLATFORM_APP_ORIGIN, notificationUrl: env.MERCADO_PAGO_NOTIFICATION_URL,
    notificationAuth: observe ? "hmac" : env.MERCADO_PAGO_NOTIFICATION_AUTH || "resource_lookup", webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
    // Defense in depth: even an accidental adapter call cannot POST/PUT in observe.
    fetchImpl: observe ? (url, init) => {
      if (init?.method !== "GET") fail("billing_disabled", 503);
      return fetchImpl(url, init);
    } : fetchImpl,
  }) : null;
  const auth = async token => { if (!token) return null; const { data, error } = await client.auth.getUser(token); return error ? null : data.user; };
  if (!enabled) {
    const disabled = async () => fail("billing_disabled", 503);
    // No subscriptions engine, leases, reconciliation or user commands in observe.
    return { billing: { user: disabled, process: disabled, reconcile: disabled,
      webhook: observe ? notificationObserver({ gateway, service }) : disabled }, gateway: null, service };
  }
  return { billing: subscriptions({ gateway, service, asUser, auth }), gateway, service };
}
