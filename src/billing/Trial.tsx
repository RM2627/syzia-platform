import { useState, useRef, type FormEvent } from "react";
import { rpc, errorMessage } from "../api";
import { Dialog } from "../ui/Dialog";
export type TrialData = {
  eligibility: string;
  grants: {
    id: string;
    plan_name: string;
    starts_at: string;
    ends_at: string;
    status: string;
    remaining_days: number;
    extensions: number;
    legacy_dates_uncertain: boolean;
  }[];
  requests: {
    id: string;
    state: string;
    plan_id: string;
    risk_reason?: string;
    created_at: string;
  }[];
  verified:
    { kind: string; evidence_ref: string; verified_at: string }[] | null;
  policy: {
    revision: number;
    auto_enabled: boolean;
    required_types: string[];
    match_types: string[];
    max_admin_days: number;
  } | null;
  audit:
    | { action: string; created_at: string; details: Record<string, unknown> }[]
    | null;
};
const date = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Recife",
  }).format(new Date(s));
const statuses: Record<string, string> = {
  active: "Em teste",
  expired: "Teste encerrado",
  converted: "Assinatura ativada",
  cancelled: "Cancelado",
  suspended: "Suspenso",
  ended: "Encerrado",
};
const actions: Record<string, string> = {
  review_requested: "Análise solicitada",
  grant: "Período concedido",
  approve: "Exceção aprovada",
  deny: "Concessão recusada",
  extend: "Prazo estendido",
  identifier_verified: "Identidade verificada",
  policy_changed: "Política de elegibilidade alterada",
  legacy_import: "Benefício anterior preservado",
};
const kinds: Record<string, string> = {
  business: "Empresa",
  responsible: "Responsável",
  phone: "Telefone verificado",
};
const risks: Record<string, string> = {
  previous_grant: "Benefício anterior nesta organização",
  previous_identity: "Correspondência com identidade já beneficiada",
  verification_required: "Falta identidade verificada",
  manual_policy: "Política exige análise",
  previous_review: "Solicitação anterior recusada",
};
export function TrialPanel({
  data,
  org,
  revision,
  platform,
  busy,
  run,
}: {
  data: TrialData;
  org: string;
  revision: number;
  platform: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [modal, setModal] = useState<
      "verify" | "policy" | "decision" | "extend" | null
    >(null),
    [request, setRequest] = useState<string | null>(null);
  const [verificationType, setVerificationType] = useState("CPF");
  const [localError, setLocalError] = useState("");
  const pending = useRef<{
    signature: string;
    key: string;
    revision: number;
  } | null>(null);
  const grant = data.grants[0],
    policy = data.policy;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const action = modal;
    const signature = JSON.stringify([org, action, request, ...f.entries()]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID(), revision };
    const key = pending.current.key;
    const expectedRevision = pending.current.revision;
    setLocalError("");
    await run(async () => {
      try {
        if (action === "verify")
          await rpc("billing051_verify_identity", {
            p_org: org,
            p_type: verificationType,
            p_value: f.get("identifier"),
            p_method: f.get("method"),
            p_confirmed: f.has("verified"),
          });
        if (action === "policy" && policy)
          await rpc("billing_trial_policy_save", {
            p_revision: policy.revision,
            p_auto: f.has("auto"),
            p_required: f.getAll("required"),
            p_match: [
              "business",
              "responsible",
              ...(f.has("phoneMatch") ? ["phone"] : []),
            ],
            p_max_days: Number(f.get("maximum")),
            p_reason: f.get("reason"),
          });
        if (action === "decision" || action === "extend")
          await rpc("billing_trial_admin", {
            p_org: org,
            p_action: action === "extend" ? "extend" : f.get("decision"),
            p_request: request,
            p_revision: expectedRevision,
            p_days: Number(f.get("days")),
            p_reason: f.get("reason"),
            p_override: f.has("override"),
            p_key: key,
          });
        pending.current = null;
        setModal(null);
      } catch (e) {
        setLocalError(errorMessage(e));
        throw e;
      }
    }, "Análise de período gratuito registrada. Confira o histórico.");
  }
  return (
    <section className="ds-panel b-trial" aria-label="Período gratuito">
      <p className="eyebrow">EXPERIMENTE COM CLAREZA</p>
      <h2>Período gratuito</h2>
      {grant ? (
        <>
          <div className="b-trial-summary">
            <div>
              <span className="badge">
                {statuses[grant.status] || grant.status}
              </span>
              <h3>{grant.plan_name}</h3>
              <p>
                Início: {date(grant.starts_at)}
                <br />
                Encerramento: {date(grant.ends_at)} · horário de Recife
              </p>
            </div>
            {grant.status === "active" && (
              <p className="b-trial-days">
                <strong>{grant.remaining_days}</strong>{" "}
                {grant.remaining_days === 1 ? "dia restante" : "dias restantes"}
                <small>Prazo exato na data de encerramento</small>
              </p>
            )}
          </div>
          {grant.legacy_dates_uncertain && (
            <p className="muted">
              Registro migrado: as datas originais do benefício anterior não
              estão completas.
            </p>
          )}
          <p>
            {grant.extensions}{" "}
            {grant.extensions === 1
              ? "extensão administrativa registrada"
              : "extensões administrativas registradas"}
            .
          </p>
        </>
      ) : (
        <p>
          O prazo vem do plano escolhido. A concessão depende da elegibilidade
          da empresa e da verificação de identidade. Na contratação com cartão,
          o acesso depende também da confirmação da assinatura.
        </p>
      )}
      {!platform && <a href="#planos-disponiveis" className="button">Assinar agora · ver planos</a>}
      <p className="b-trial-explanation">
        Ao terminar sem uma assinatura ativa, novas operações sujeitas ao plano
        ficam bloqueadas. Seus dados e histórico são preservados; você pode
        acessar a administração para contratar ou reativar. A renovação segue
        as condições da assinatura confirmada.
      </p>
      {data.requests
        .filter((r) => r.state === "pending")
        .map((r) => (
          <div className="b-confirm" key={r.id}>
            <strong>Solicitação em análise</strong>
            <p>
              A equipe administrativa verificará a elegibilidade. Um novo
              cadastro ou e-mail não libera automaticamente outro teste.
            </p>
            {platform && (
              <>
                <p>{risks[r.risk_reason || ""] || "Revisão necessária"}</p>
                <button
                  disabled={busy}
                  onClick={() => {
                    setRequest(r.id);
                    setModal("decision");
                  }}
                >
                  Analisar solicitação
                </button>
              </>
            )}
          </div>
        ))}
      {data.requests[0]?.state === "denied" && (
        <p role="status">
          A concessão não foi aprovada. Você pode solicitar nova análise de uma
          exceção legítima à administração, ou escolher a contratação.
        </p>
      )}
      {platform && (
        <>
          <div className="b-actions">
            <button disabled={busy} onClick={() => setModal("verify")}>
              Registrar identidade verificada
            </button>
            <button disabled={busy} onClick={() => setModal("policy")}>
              Política de elegibilidade
            </button>
            {grant &&
              ["active", "expired", "cancelled"].includes(grant.status) && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setRequest(null);
                    setModal("extend");
                  }}
                >
                  Estender teste
                </button>
              )}
          </div>
          <details>
            <summary>Verificações e histórico administrativo</summary>
            <p className="muted">
              Identificadores completos e hashes não são exibidos. Referências
              devem apontar para a verificação autorizada, sem documentos
              pessoais neste histórico.
            </p>
            <ul>
              {data.verified?.map((v, i) => (
                <li key={i}>
                  {kinds[v.kind] || "Identidade"} · {v.evidence_ref} ·{" "}
                  {date(v.verified_at)}
                </li>
              ))}
            </ul>
            <ul>
              {data.audit?.map((a, i) => (
                <li key={i}>
                  {actions[a.action] || "Decisão administrativa"} ·{" "}
                  {date(a.created_at)}
                  {typeof a.details.reason === "string"
                    ? " · " + a.details.reason
                    : ""}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {modal && (
        <Dialog
          title={
            modal === "verify"
              ? "Verificação administrativa"
              : modal === "policy"
                ? "Política de elegibilidade"
                : modal === "extend"
                  ? "Extensão do período gratuito"
                  : "Análise da solicitação"
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <form onSubmit={submit}>
            {localError && (
              <p role="alert" className="notice error">
                {localError}
              </p>
            )}
            {modal === "verify" && (
              <>
                <p>Confira a identidade por um procedimento autorizado e registre o resultado. A SYZIA verifica automaticamente o histórico e a elegibilidade; esta ação não cria uma assinatura nem libera acesso pago.</p>
                <label>
                  O que você conferiu?
                  <select value={verificationType} onChange={e => setVerificationType(e.target.value)}>
                    <option value="CPF">CPF — responsável que atua como pessoa física</option>
                    <option value="CNPJ">CNPJ — identificação da empresa</option>
                    <option value="responsible">CPF — responsável por empresa com CNPJ</option>
                    <option value="phone">Posse do telefone</option>
                  </select>
                </label>
                <label>
                  {verificationType === "phone" ? "Telefone com DDD" : verificationType === "CNPJ" ? "CNPJ conferido" : "CPF conferido"}
                  <input name="identifier" required maxLength={25} inputMode="tel" autoComplete="off" />
                </label>
                <p className="muted">{verificationType === "CPF"
                  ? "Uma única conferência registra a pessoa física e o responsável. Não é necessário repetir o CPF em dois formulários."
                  : verificationType === "CNPJ" ? "O responsável pela empresa deve ter seu CPF conferido separadamente."
                  : "Informe apenas o dado que você realmente conferiu."} O valor será protegido por hash privado; não inclua documentos nos registros de observações.</p>
                <label>
                  Como a verificação foi feita?
                  <select name="method" key={verificationType}>
                    {verificationType === "phone" ? <option value="verified_contact">Contato que confirmou a posse do telefone</option> : <>
                      <option value="document_checked">Conferi documento e vínculo do responsável</option>
                      <option value="in_person">Conferência presencial da identidade</option>
                    </>}
                  </select>
                </label>
                <label>
                  <input type="checkbox" name="verified" required />
                  Confirmo que realizei a verificação indicada. Não estou apenas confirmando dados digitados pelo cliente.
                </label>
              </>
            )}
            {modal === "policy" && policy && (
              <>
                <label>
                  <input
                    name="auto"
                    type="checkbox"
                    defaultChecked={policy.auto_enabled}
                  />
                  Permitir concessão automática com evidência válida
                </label>
                <fieldset>
                  <legend>Evidências exigidas na contratação com cartão</legend>
                  {[
                    ["business", "Empresa"],
                    ["responsible", "Responsável"],
                    ["phone", "Telefone verificado"],
                  ].map(([k, label]) => (
                    <label key={k}>
                      <input
                        name="required"
                        value={k}
                        type="checkbox"
                        defaultChecked={policy.required_types.includes(k)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <p>
                  Conta, empresa e responsável já beneficiados sempre exigem
                  análise. Redes/dispositivos não são bloqueadores.
                </p>
                <label>
                  <input
                    name="phoneMatch"
                    type="checkbox"
                    defaultChecked={policy.match_types.includes("phone")}
                  />
                  Encaminhar telefone já beneficiado para revisão
                </label>
                <label>
                  Máximo de dias por concessão/extensão administrativa
                  <input
                    name="maximum"
                    type="number"
                    min={1}
                    max={365}
                    required
                    defaultValue={policy.max_admin_days}
                  />
                </label>
              </>
            )}
            {(modal === "decision" || modal === "extend") && (
              <>
                {modal === "decision" && (
                  <label>
                    Decisão
                    <select name="decision">
                      <option value="approve">Conceder exceção legítima</option>
                      <option value="deny">Recusar concessão</option>
                    </select>
                  </label>
                )}
                <label>
                  Dias autorizados
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={policy?.max_admin_days || 365}
                    required
                    placeholder="Informe o prazo aprovado"
                  />
                </label>
                <label>
                  <input name="override" type="checkbox" />
                  Autorizo expressamente esta exceção/extensão após análise. A
                  decisão será auditada.
                </label>
                <p className="muted">
                  A extensão soma dias ao término atual, ou ao momento atual se
                  o prazo terminou. Assinatura paga ou suspensa não é
                  substituída por teste.
                </p>
              </>
            )}
            {modal !== "verify" && (
            <label>
              Motivo administrativo
              <input
                name="reason"
                required
                minLength={10}
                maxLength={300}
                placeholder="Justificativa sem dados pessoais"
              />
            </label>
            )}
            <button disabled={busy} type="submit">
              {busy ? "Registrando…" : modal === "verify" ? "Confirmar verificação" : "Registrar decisão"}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
