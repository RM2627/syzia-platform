import { ConfigurationReview } from "./ConfigurationReview";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, rpc } from "../api";
import { SiteFrame } from "../acquisition/PublicSite";
import { SelfService } from "../acquisition/SelfService";
import { invitationApi, commercialError } from "./api";
async function sha(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function invitationToken() {
  const p = new URLSearchParams(window.location.hash.slice(1)),
    token = p.get("convite");
  if (token) {
    sessionStorage.setItem("syzia-commercial-invitation", token);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }
  return token || sessionStorage.getItem("syzia-commercial-invitation") || "";
}
export function Unsubscribe() {
  const [token] = useState(invitationToken),
    [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <SiteFrame title="Preferências de contato — SYZIA">
      <section className="sy-section">
        <h1>Convites comerciais</h1>
        {done ? (
          <p role="status">
            Solicitação registrada. Este endereço não receberá novos convites
            comerciais.
          </p>
        ) : (
          <>
            <p>
              Você pode interromper os convites de demonstração e ativação.
              Comunicações essenciais de uma conta existente não são alteradas.
            </p>
            <button
              disabled={busy || !token}
              onClick={() => {
                setBusy(true);
                void invitationApi("unsubscribe", {
                  invitation: token,
                  confirmed: true,
                })
                  .then(() => setDone(true))
                  .catch((e) => setError(commercialError(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Confirmar descadastramento
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </SiteFrame>
  );
}
export function ActivateCompany() {
  const [token] = useState(invitationToken),
    [invitation, setInvitation] = useState<any>(),
    [session, setSession] = useState<any>(),
    [claim, setClaim] = useState<any>(),
    [identity, setIdentity] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [continueSetup, setContinueSetup] = useState(false);
  async function load() {
    setError("");
    setInvitation(undefined);
    setClaim(undefined);
    setReviewed(false);
    setContinueSetup(false);
    const i = await invitationApi("invite", { invitation: token });
    if (i.purpose !== "activation") throw Error("commercial_invite_invalid");
    setInvitation(i);
    const s = (await supabase?.auth.getSession())?.data.session;
    setSession(s || null);
    if (s) {
      const q = await rpc<any>("commercial_claim_request", {
        p_hash: await sha(token), p_statement: null,
      });
      sessionStorage.setItem("syzia-commercial-claim:" + i.id, q.id);
      setClaim(await rpc("commercial_claim_context", { p_id: q.id }));
    }
  }
  useEffect(() => {
    void load().catch((e) => setError(commercialError(e)));
  }, []);
  if (identity)
    return (
      <SelfService
        identityOnly
        onIdentityReady={() => {
          setIdentity(false);
          void load().catch((e) => setError(commercialError(e)));
        }}
      />
    );
  if (continueSetup && claim?.state === "approved" && !claim.stale && reviewed)
    return (
      <SelfService
        activation={{
          id: claim.id,
          snapshot: claim.snapshot_hash,
          company: claim.company,
        }}
      />
    );
  return (
    <SiteFrame title="Ativação vinculada — SYZIA">
      <section className="sy-section sy-registration">
        <h1>
          {invitation
            ? "Preparação de " + invitation.company
            : "Ativação vinculada"}
        </h1>
        <p>
          Este convite autoriza o destinatário a iniciar a ativação. Entre com a conta do e-mail que recebeu o convite e confira a configuração preparada. A liberação depende da confirmação da assinatura.
        </p>
        {error && <p role="alert">{error}</p>}
        {!invitation && !error && <p role="status">Conferindo convite…</p>}
        {invitation && !session && (
          <div className="sy-form-card">
            <h2>Identifique-se para continuar</h2>
            <button onClick={() => setIdentity(true)}>
              Criar identidade pela SYZIA
            </button>
            <Link to="/entrar?retorno=convite-comercial">Já tenho conta · Entrar</Link>
            <p>
              Depois de entrar ou confirmar seu e-mail, retorne a este convite
              para continuar.
            </p>
            <button
              onClick={() =>
                void load().catch((e) => setError(commercialError(e)))
              }
            >
              Já entrei · Atualizar
            </button>
          </div>
        )}
        {invitation && session && !claim && (
          <div className="sy-form-card">
            <p>Use a conta com o e-mail destinatário confirmado. Se a identidade estiver incompleta, conclua o cadastro para continuar.</p>
            <button disabled={busy} onClick={() => setIdentity(true)}>Conferir minha identidade</button>
            <Link to="/entrar?retorno=convite-comercial">Entrar com outra conta</Link>
            <button disabled={busy} onClick={() => {
              setBusy(true);
              void load().catch(e => setError(commercialError(e))).finally(() => setBusy(false));
            }}>Já confirmei · Continuar</button>
          </div>
        )}
        {claim && (
          <div className="sy-form-card">
            <h2>
              {
                (
                  {
                    requested: "Confirme sua identidade para continuar",
                    approved: "Convite verificado",
                    rejected: "Ativação indisponível",
                    prepared: "Empresa preparada para contratação",
                    materialized: "Configuração vinculada",
                  } as any
                )[claim.state]
              }
            </h2>
            {claim.state === "requested" && (
              <p>
                Atualize o convite após confirmar a identidade destinatária.
              </p>
            )}
            {claim.state === "rejected" && (
              <p>Entre em contato com a SYZIA para verificar este convite.</p>
            )}
            {claim.stale && !claim.organization_id && (
              <p>O convite ou a preparação não está mais disponível. Solicite um convite válido.</p>
            )}
            {["prepared","materialized"].includes(claim.state) ? (
              <Link to={"/painel/" + claim.organization_id + "/assinatura"}>
                Continuar na empresa preparada
              </Link>
            ) : (
              <button
                onClick={() =>
                  void load().catch((e) => setError(commercialError(e)))
                }
              >
                Atualizar convite
              </button>
            )}
            {claim.state === "approved" && !claim.stale && (
              <>
                <h3>Revise a configuração</h3>
                <ConfigurationReview configuration={claim.configuration} />
                <p>
                  Template: {claim.configuration?.template}. A configuração será
                  importada após a confirmação válida da assinatura, sem publicação automática. Clientes,
                  equipe, atendimentos, reservas e histórico demonstrativo não
                  serão transferidos.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  Revisei e aprovo a configuração preparada para minha empresa.
                </label>
                <button
                  disabled={!reviewed}
                  onClick={() => setContinueSetup(true)}
                >
                  Escolher plano e continuar pelo cadastro oficial
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </SiteFrame>
  );
}
