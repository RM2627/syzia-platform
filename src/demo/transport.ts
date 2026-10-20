import type { SupabaseClient } from "@supabase/supabase-js";
import {embeddedEditor,editorRequest} from './editor-bridge';
export const demoBuild = import.meta.env.VITE_APP_REALM === "demo";
export const demoOrigin = import.meta.env.VITE_COMMERCIAL_DEMO_ORIGIN || "";
export const demoAPI = import.meta.env.VITE_COMMERCIAL_API_URL || "";
export type DemoSession = {
  token: string;
  expires_at: string;
  organization: { id: string; name: string; slug: string; status: "active" };
  source_id: string;
  slug: string;
  kind: "editor" | "visitor";
  personas: { company: string; consumer: string };
};
let current: DemoSession | null = null;
export function getDemoSession() {
  return current;
}
export function setDemoSession(s: DemoSession | null) {
  current = s;
  if (s) sessionStorage.setItem("syzia-demo-session", JSON.stringify(s));
  else sessionStorage.removeItem("syzia-demo-session");
}
export function storedDemoSession(): DemoSession | null {
  try {
    return JSON.parse(sessionStorage.getItem("syzia-demo-session") || "null");
  } catch {
    return null;
  }
}
export async function demoCall<T = any>(
  path: string,
  body: unknown = {},
  token = current?.token,
): Promise<T> {
  if (!demoBuild || window.location.origin !== demoOrigin || !demoAPI)
    throw Error("demo_origin_not_configured");
  if(embeddedEditor)return editorRequest<T>(path,body);
  const r = await fetch(demoAPI + "/demonstrations/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "demo_operation_failed");
  return result;
}
export async function demoRPC<T>(
  perspective: "company" | "consumer",
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return demoCall("rpc", { perspective, name, args });
}
function client(perspective: "company" | "consumer") {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      try {
        return { data: await demoRPC(perspective, name, args), error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    auth: {
      getSession: async () => ({
        data: {
          session: current
            ? {
                access_token: current.token + "." + perspective,
                user: {
                  id: current.personas[perspective],
                  is_anonymous: perspective === "consumer",
                },
              }
            : null,
        },
        error: null,
      }),
      signInAnonymously: async () => ({
        data: {},
        error: current ? null : Error("demo_session_required"),
      }),
      signOut: async () => {
        if (current) await demoCall("end");
        setDemoSession(null);
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
}
export const demoCompanyClient = client("company"),
  demoConsumerClient = client("consumer");
export const demoMessage = (e: unknown) => {
  const code = (e as Error)?.message;
  const map: Record<string, string> = {
    demo_session_expired:
      "Esta sessão terminou. Abra novamente o link recebido.",
    commercial_demo_unavailable: "Esta demonstração expirou ou foi revogada.",
    demo_configuration_not_ready:
      "Conclua os requisitos da página e confira a prévia antes de disponibilizar.",
    demo_operation_denied: "Esta ação não está disponível na demonstração.",
    demo_external_action_denied:
      "Esta ação externa permanece desativada na demonstração.",
    demo_scope_denied: "O registro não pertence a esta demonstração.",
    demo_capacity_reached:
      "O ambiente está ocupado. Tente novamente em alguns instantes.",
    demo_origin_not_configured:
      "O endereço demonstrativo ainda não foi configurado neste ambiente.",
  };
  return (
    map[code] || "Não foi possível concluir. Revise os dados e tente novamente."
  );
};
