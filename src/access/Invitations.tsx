import { useEffect, useState, useRef, type FormEvent } from "react";
import { rpc, supabase, errorMessage } from "../api";
export type Invitation = { id: string; name: string; email: string; role: string; state: string; delivery_state: string; expires_at: string };
const safeCodes = new Set([
  "invitation_invalid", "access_denied", "invitation_not_available", "invitation_expired", "invitation_revoked",
  "invitation_cooldown", "invitation_attempt_limit", "invitation_rate_limited", "email_recipient_not_authorized",
  "email_delivery_failed", "recovery_delivery_failed", "temporary_delivery_failure", "invitation_delivery_unavailable",
  "invitation_delivery_unconfirmed",
]);
export async function sendInvitation(id: string): Promise<{ sent: boolean; demo_access_url?: string }> {
  const api = import.meta.env.VITE_PLATFORM_API_URL;
  if (!api) throw Error("invitation_delivery_unavailable");
  const base = new URL(api);
  if (base.protocol !== "https:" && !(["localhost", "127.0.0.1"].includes(base.hostname) && base.protocol === "http:")) throw Error("invitation_delivery_unavailable");
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw Error("access_denied");
  let response;
  try {
    response = await fetch(base.origin + "/invitations/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token }, body: JSON.stringify({ invitation_id: id }) });
  } catch { throw Error("temporary_delivery_failure"); }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Error(safeCodes.has(result?.error) ? result.error : "temporary_delivery_failure");
  if (result?.sent !== true) throw Error("invitation_delivery_unconfirmed");
  return { sent: true, ...(import.meta.env.VITE_LOCAL_DEMO === "true" && typeof result.demo_access_url === "string" ? { demo_access_url: result.demo_access_url } : {}) };
}
function deliveryLabel(value: string) {
  return ({ not_sent: "Nenhum envio confirmado", sending: "Envio solicitado; confirmação pendente", sent: "Envio anterior aceito pelo serviço de e-mail", failed: "Última tentativa de envio falhou" } as Record<string, string>)[value] || "Situação do envio desconhecida";
}
export function Invitations({ org }: { org: string }) {
  const [items, setItems] = useState<Invitation[]>([]), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [demo, setDemo] = useState("");
  const [failedAttempts, setFailedAttempts] = useState<Record<string, string>>({});
  const [stale, setStale] = useState(false);
  const attemptSequence = useRef(0);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  async function load() {
    const { data, error } = await supabase!.from("organization_invitations").select("id,name,email,role,state,delivery_state,expires_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    setItems(data || []); setStale(false);
  }
  useEffect(() => {
    let active = true;
    const sequence = attemptSequence.current;
    void load().catch(e => { if (active) { setStale(true); if (attemptSequence.current === sequence) setError(errorMessage(e)); } });
    return () => { active = false; };
  }, [org]);
  function begin() { attemptSequence.current++; setBusy(true); setError(""); setNotice(""); setDemo(""); }
  async function refreshList() {
    try { await load(); } catch { setStale(true); }
  }
  async function send(id: string) {
    setFailedAttempts(old => { const next = { ...old }; delete next[id]; return next; });
    try {
      const result = await sendInvitation(id);
      setNotice("Instruções solicitadas ao serviço de e-mail. Peça à pessoa que use a mensagem mais recente.");
      setDemo(result.demo_access_url || "");
    } catch (e) {
      setNotice(""); setDemo("");
      setFailedAttempts(old => ({ ...old, [id]: errorMessage(e) }));
      throw e;
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); begin();
    const f = new FormData(e.currentTarget), payload = { p_org: org, p_name: f.get("name"), p_email: f.get("email"), p_role: f.get("role") };
    const signature = JSON.stringify(payload);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    try {
      const id = await rpc<string>("foundation_invite", { ...payload, p_key: pending.current.key });
      await send(id); pending.current = null;
    } catch (e) { setNotice(""); setError(errorMessage(e)); }
    finally { await refreshList(); setBusy(false); }
  }
  async function resend(id: string) {
    begin();
    try { await send(id); } catch (e) { setError(errorMessage(e)); }
    finally { await refreshList(); setBusy(false); }
  }
  async function revoke(id: string) {
    begin();
    try { await rpc("foundation_revoke_invitation", { p_invite: id }); pending.current = null; setNotice("Convite revogado."); }
    catch (e) { setError(errorMessage(e)); }
    finally { await refreshList(); setBusy(false); }
  }
  return <section className="card"><h2>Convidar uma pessoa</h2><p>A pessoa recebe instruções no próprio e-mail. Você escolhe o acesso à sua empresa e nunca precisa conhecer a senha dela.</p>
    <form onSubmit={submit}><label>Nome da pessoa<input name="name" required minLength={2} maxLength={120} /></label><label>E-mail do convite<input name="email" type="email" required maxLength={254} /></label><label>Papel do convite<select name="role"><option value="colaborador_empresa">Colaborador</option><option value="own_attendant">Atendente próprio</option><option value="admin_empresa">Administrador</option></select></label><button className="primary" disabled={busy}>Enviar convite</button></form>
    {busy && <p role="status">Processando a tentativa atual…</p>}{error && <p role="alert">{error}</p>}{notice && !error && <p role="status">{notice}</p>}
    {demo && !error && <p className="notice">Somente demo fictícia — <a href={demo} target="_blank" rel="noreferrer">Simular primeiro acesso</a></p>}
    <h3>Convites da empresa</h3>{stale && <p role="alert">Não foi possível atualizar a lista. A situação do envio abaixo precisa ser confirmada.</p>}
    {!items.length && !stale && <p>Nenhum convite registrado.</p>}
    {items.map(i => <article className="list-row" key={i.id}><div><strong>{i.name}</strong><small>{i.email}</small>
      <small>{i.state === "accepted" ? "Aceito" : i.state === "revoked" ? "Revogado" : new Date(i.expires_at) <= new Date() ? "Expirado" : "Pendente"} · {failedAttempts[i.id] ? "Tentativa atual não concluída" : stale ? "Envio a confirmar" : deliveryLabel(i.delivery_state)}</small>
      {failedAttempts[i.id] && <small>{i.delivery_state === "sent" ? "Houve um envio anterior; o reenvio atual não foi confirmado. " : ""}{failedAttempts[i.id]}</small>}
    </div>{i.state === "pending" && new Date(i.expires_at) > new Date() && <div><button disabled={busy} onClick={() => void resend(i.id)}>Reenviar instruções</button><button disabled={busy} onClick={() => void revoke(i.id)}>Revogar convite</button></div>}</article>)}
  </section>;
}
