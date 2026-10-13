import { supabase } from "../api";
export async function billingApi(path: string, body: Record<string, unknown>) {
  const base = import.meta.env.VITE_BILLING_API_URL;
  if (!base) throw Error("billing_credentials_missing");
  const u = new URL(base);
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname))
  )
    throw Error("billing_credentials_missing");
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const response = await fetch(base.replace(/\/$/, "") + "/billing/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (token || ""),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error);
  return value;
}
let sdk: Promise<void> | undefined;
export async function loadSDK() {
  if ((window as any).MercadoPago) return;
  if (!sdk)
    sdk = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        sdk = undefined;
        reject(Error("billing_provider_unavailable"));
      };
      document.head.append(script);
    });
  return sdk;
}
