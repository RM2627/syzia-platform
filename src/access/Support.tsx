import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { rpc, errorMessage } from "../api";
type Request = {
  id: string;
  mode: "normal" | "emergency";
  reason: string;
  hours: number;
  state: "pending" | "approved" | "denied" | "revoked";
  requester_name: string;
  decider_name: string | null;
  created_at: string;
  decided_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  effective: boolean;
};
type Context = {
  responsible: boolean;
  global: boolean;
  allowed: boolean;
  requests: Request[];
  visits: {
    id: string;
    actor_name: string;
    regime: string;
    entered_at: string;
  }[];
};
const when = (s: string) => new Date(s).toLocaleString("pt-BR");
function useSupport(org: string) {
  const [data, setData] = useState<Context | null>(null),
    [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const n = ++generation.current;
    try {
      const value = await rpc<Context>("support_context", { p_org: org });
      if (n === generation.current) {
        setData(value);
        setError("");
      }
    } catch (e) {
      if (n === generation.current) {
        setData(null);
        setError(errorMessage(e));
      }
    }
  }, [org]);
  useEffect(() => {
    setData(null);
    void reload();
    const timer = setInterval(() => void reload(), 5000);
    const focus = () => void reload();
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [reload]);
  // Expiration removes operational children even without a network response.
  useEffect(() => {
    if (!data?.global || !data.responsible || !data.allowed) return;
    const until = Math.max(
      0,
      ...data.requests
        .filter((r) => r.effective && r.expires_at)
        .map((r) => new Date(r.expires_at!).getTime()),
    );
    const timer = setTimeout(
      () => {
        setData((d) => (d ? { ...d, allowed: false } : d));
        void reload();
      },
      Math.max(0, until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [data, reload]);
  return { data, error, reload };
}
export function SupportBoundary({
  org,
  children,
}: {
  org: string;
  children: ReactNode;
}) {
  const { data, error, reload } = useSupport(org),
    [entered, setEntered] = useState(false),
    [entryError, setEntryError] = useState("");
  const [retry, setRetry] = useState(0);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    let current = true;
    if (!data?.allowed) {
      setEntered(false);
      key.current = crypto.randomUUID();
      return;
    }
    if (!entered)
      void rpc("support_enter", { p_org: org, p_key: key.current })
        .then(() => {
          if (current) {
            setEntered(true);
            setEntryError("");
          }
        })
        .catch((e) => {
          if (current) {
            setEntryError(errorMessage(e));
            setEntered(false);
          }
        });
    return () => {
      current = false;
    };
  }, [org, data?.allowed, entered, retry]);
  if (error || entryError)
    return (
      <section className="card">
        <p role="alert">{error || entryError}</p>
        <button
          onClick={() => {
            setEntryError("");
            setRetry((n) => n + 1);
            void reload();
          }}
        >
          Verificar acesso novamente
        </button>
      </section>
    );
  if (!data)
    return <p role="status">Verificando autorização para esta empresa…</p>;
  if (!data.allowed)
    return <SupportPanel org={org} data={data} reload={reload} />;
  if (!entered) return <p role="status">Registrando entrada na empresa…</p>;
  const grant = data.requests
    .filter((r) => r.effective)
    .sort(
      (a, b) => Number(a.mode === "emergency") - Number(b.mode === "emergency"),
    )[0];
  return (
    <>
      <div className="notice" role="status">
        {!data.responsible ? (
          <strong>
            Sob gestão da SYZIA · aguardando ADM responsável ativo
          </strong>
        ) : (
          grant && (
            <>
              <strong>
                {grant.mode === "emergency"
                  ? "Acesso administrativo de emergência"
                  : "Suporte autorizado pelo ADM"}
              </strong>
              <p>
                Motivo: {grant.reason} · Até {when(grant.expires_at!)}
              </p>
            </>
          )
        )}
        <Link to={`/painel/${org}/suporte`}>
          Consultar histórico e encerrar acesso
        </Link>
      </div>
      {children}
    </>
  );
}
function SupportPanel({
  org,
  data,
  reload,
}: {
  org: string;
  data: Context;
  reload: () => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [hours, setHours] = useState(1),
    [emergency, setEmergency] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const command = useRef({ key: crypto.randomUUID(), payload: "" });
  async function act(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const pending = data.requests.some((r) => r.state === "pending");
  return (
    <section className="card support-center">
      <h1>Suporte SYZIA</h1>
      <p>
        {data.global
          ? data.responsible
            ? "Esta empresa tem ADM responsável. Solicite autorização temporária para acessar sua operação."
            : "Empresa sob gestão da SYZIA. Consulte abaixo o histórico de entradas."
          : "Autorize somente solicitações reconhecidas. Você pode recusar ou revogar o acesso da SYZIA a qualquer momento."}
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data.global && data.responsible && (
        <>
          {!pending && !data.allowed && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const payload = JSON.stringify([
                  reason.trim(),
                  hours,
                  emergency,
                ]);
                if (command.current.payload !== payload)
                  command.current = { key: crypto.randomUUID(), payload };
                void act(async () => {
                  await rpc("support_request", {
                    p_org: org,
                    p_reason: reason,
                    p_hours: hours,
                    p_key: command.current.key,
                    p_emergency: emergency,
                  });
                  command.current = { key: crypto.randomUUID(), payload: "" };
                  setReason("");
                });
              }}
            >
              <label>
                Motivo do acesso
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={15}
                  maxLength={500}
                />
              </label>
              {!emergency && (
                <label>
                  Duração solicitada
                  <select
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                  >
                    {[1, 4, 24].map((h) => (
                      <option key={h} value={h}>
                        {h} hora{h > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details
                onToggle={(e) => {
                  setEmergency(e.currentTarget.open);
                  setConfirmed(false);
                }}
              >
                <summary>Acesso administrativo de emergência</summary>
                <p>
                  Intervenção excepcional de 15 minutos, registrada e visível ao
                  ADM. Limite de uma emergência por empresa a cada 30 minutos e
                  três por solicitante ao dia.
                </p>
                {emergency && (
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      required
                    />
                    Confirmo a necessidade excepcional e o registro deste
                    acesso.
                  </label>
                )}
              </details>
              <button
                className="primary"
                disabled={busy || (emergency && !confirmed)}
              >
                {emergency
                  ? "Iniciar emergência de 15 minutos"
                  : "Solicitar autorização ao ADM"}
              </button>
            </form>
          )}
          {pending && (
            <p role="status">
              Solicitação enviada. Aguardando decisão do ADM. Você pode cancelar
              a solicitação abaixo.
            </p>
          )}
        </>
      )}
      <h2>Solicitações e autorizações</h2>
      {!data.requests.length && (
        <p>Nenhuma solicitação de suporte nesta empresa.</p>
      )}
      {data.requests.map((r) => (
        <article key={r.id} className="organization-record">
          <h3>
            {r.mode === "emergency" ? "Emergência" : "Suporte solicitado"} ·{" "}
            {r.requester_name}
          </h3>
          <p>{r.reason}</p>
          <p>
            Solicitado em {when(r.created_at)}
            {r.hours ? ` · ${r.hours}h` : " · 15 minutos"}
          </p>
          <p>
            {r.state === "approved"
              ? r.effective
                ? "Acesso ativo"
                : "Autorização encerrada ou expirada"
              : {
                  pending: "Aguardando decisão",
                  denied: "Recusado",
                  revoked: "Revogado",
                }[r.state]}
            {r.decider_name && ` · Decisão: ${r.decider_name}`}
            {r.expires_at && ` · Validade: ${when(r.expires_at)}`}
            {r.revoked_at && ` · Revogado em ${when(r.revoked_at)}`}
          </p>
          <div className="org-actions">
            {!data.global && r.state === "pending" && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      rpc("support_decide", { p_id: r.id, p_approve: true }),
                    )
                  }
                >
                  Autorizar por {r.hours}h
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      rpc("support_decide", { p_id: r.id, p_approve: false }),
                    )
                  }
                >
                  Recusar solicitação
                </button>
              </>
            )}
            {(r.state === "pending" || r.effective) && (
              <button
                disabled={busy}
                onClick={() =>
                  void act(() => rpc("support_revoke", { p_id: r.id }))
                }
              >
                {r.state === "pending"
                  ? "Cancelar solicitação"
                  : "Revogar acesso"}
              </button>
            )}
          </div>
        </article>
      ))}
      <h2>Entradas da SYZIA nesta empresa</h2>
      {!data.visits.length && <p>Nenhuma entrada registrada.</p>}
      <ul>
        {data.visits.map((v) => (
          <li key={v.id}>
            {when(v.entered_at)} · {v.actor_name} ·{" "}
            {{
              managed: "Gestão da SYZIA",
              normal: "Suporte autorizado",
              emergency: "Emergência",
            }[v.regime] || v.regime}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function SupportCenter({ org }: { org: string }) {
  const { data, error, reload } = useSupport(org);
  if (error) return <p role="alert">{error}</p>;
  return data ? (
    <SupportPanel org={org} data={data} reload={reload} />
  ) : (
    <p role="status">Carregando suporte…</p>
  );
}
export function SupportNotice({ org }: { org: string }) {
  const { data } = useSupport(org);
  const pending =
    data?.requests.filter((r) => r.state === "pending").length || 0;
  const active = data?.requests.filter((r) => r.effective).length || 0;
  return pending || active ? (
    <div className="notice" role="status">
      Suporte SYZIA: {pending} solicitação(ões) aguardando decisão · {active}{" "}
      acesso(s) ativo(s).{" "}
      <Link to={`/painel/${org}/suporte`}>Revisar autorizações</Link>
    </div>
  ) : null;
}
