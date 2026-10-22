import {commercialApi,commercialError} from "../platform-commercial/api";
import { normalizeCPF } from "../../shared/cpf.mjs";
import { PasswordInput } from "../ui/PasswordInput";
import { useEffect, useRef, useState } from "react";
import { Captcha, captchaConfigured } from "../Captcha";
import { Link, useSearchParams } from "react-router-dom";
import { supabase, rpc, errorMessage } from "../api";
import {
  accessApi,
  accessMessage,
  suggestUsername,
  suggestSlug,
} from "../access/EnterpriseAccess";
import { SiteFrame, usePlans, brl } from "./PublicSite";
function failedConfirmation() {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return ["error", "error_code", "error_description"].some(
    key => url.searchParams.has(key) || fragment.has(key),
  );
}
export function SelfService({ identityOnly=false, onIdentityReady, activation }: {identityOnly?:boolean;onIdentityReady?:()=>void;activation?:{id:string;snapshot:string;company:string}}={}) {
  const invitationReturn = identityOnly || (!activation && !!sessionStorage.getItem("syzia-commercial-invitation"));
  const [params] = useSearchParams(),
    { plans, loading } = usePlans();
  const [captcha, setCaptcha] = useState("");
  const [identitySetup, setIdentitySetup] = useState(false),
    [session, setSession] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(() => failedConfirmation()
      ? "Este link de confirmação é inválido, expirou ou já foi utilizado. Use o link mais recente ou entre para verificar sua conta. Se precisar de ajuda, escreva para syziaoficial@gmail.com."
      : ""),
    [notice, setNotice] = useState(""),
    [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [edited, setEdited] = useState(false),
    [company, setCompany] = useState(activation?.company || ""),
    [slug, setSlug] = useState(""),
    [slugEdited, setSlugEdited] = useState(false),
    [plan, setPlan] = useState(params.get("plano") || ""),
    [editing, setEditing] = useState(false),
    key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!edited) {
      const p = name.trim().split(/\s+/);
      setUsername(suggestUsername(p[0] || "", p.slice(1).join(" ")));
    }
  }, [name, edited]);
  useEffect(() => {
    if (!slugEdited) setSlug(suggestSlug(company));
  }, [company, slugEdited]);
  async function restore(s: any) {
    setSession(s);
    if (!s) {
      setReady(true);
      return;
    }
    let contexts: any = null;
    try {
      contexts = await accessApi("/access/contexts", {});
    } catch {}
    if (
      !contexts ||
      (!contexts.global && !contexts.personal && !contexts.companies.length)
    ) {
      if (
        !s.user.user_metadata?.display_name ||
        !s.user.user_metadata?.syzia_username
      ) {
        setIdentitySetup(true);
        setReady(true);
        return;
      }
      try {
        await accessApi("/access/selfservice-register", {
          name: s.user.user_metadata.display_name,
          username: s.user.user_metadata.syzia_username,
        });
      } catch (e) {
        if ((e as any)?.message === "username_conflict") {
          setName(s.user.user_metadata.display_name);
          setUsername(s.user.user_metadata.syzia_username);
          setIdentitySetup(true);
          setError(accessMessage(e));
          setReady(true);
          return;
        }
        throw e;
      }
    }
    if (invitationReturn) { setReady(true); return; }
    const found = await rpc<any>("selfservice_context");
    const d = activation && found?.state === "completed" ? null : found;
    setDraft(d);
    if (d) {
      setCompany(d.name);
      setSlug(d.slug);
      setSlugEdited(true);
      setPlan(d.plan.id);
      if (activation) setEditing(true);
    }
    setReady(true);
  }

  useEffect(() => {
    if (failedConfirmation()) {
      const url = new URL(window.location.href);
      url.hash = "";
      for (const key of ["error", "error_code", "error_description"])
        url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
    let live = true;
    supabase?.auth.getSession().then(({ data }) => {
      if (live)
        void restore(data.session).catch((e) => {
          setError(accessMessage(e));
          setReady(true);
        });
    });
    if (!supabase) {
      setReady(true);
      setError("O cadastro não está disponível neste ambiente.");
    }
    return () => {
      live = false;
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        (e as Error)?.message?.startsWith("commercial_") ? commercialError(e) : (e as any)?.message in
          {
            document_invalid: 1,
            trial_review_required: 1,
            selfservice_payment_required: 1,
            selfservice_consent_required: 1,
          }
          ? errorMessage(e)
          : accessMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  const choices = plans.filter((p) => p.self_service);
  async function enterCompany() {
    const c = await accessApi("/access/contexts", {});
    const a = c.companies.find(
      (x: any) => x.organization_id === draft.organization_id,
    );
    if (!a) throw Error("access_denied");
    await accessApi("/access/context", { account_id: a.id });
    if (activation) sessionStorage.removeItem("syzia-commercial-invitation");
    window.location.assign(
      "/painel/" +
        draft.organization_id +
        (choices.some((p) => p.billing047) ? "/assinatura" : ""),
    );
  }
  return (
    <SiteFrame title="Criar minha empresa — SYZIA">
      <section className="sy-section sy-registration">
        <p className="sy-kicker">COMECE PELA BASE</p>
        <h1>Seu próximo passo, organizado.</h1>
        <p>
          Cadastre sua identidade e os dados mínimos da empresa. Serviços,
          horários, imagens e demais configurações vêm depois, no onboarding
          empresarial.
        </p>
        <div className="sy-progress" aria-label="Etapas">
          <span>01 · Identidade</span>
          <span>02 · Empresa e plano</span>
          <span>03 · Confirmação do período grátis</span>
        </div>
        <div className="sy-form-card">
          {!ready ? (
            <p role="status">Recuperando seu cadastro…</p>
          ) : !session ? (
            <form
              key="signup"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const r = await accessApi("/access/signup", {
                    name,
                    username,
                    email: f.get("email"),
                    password: f.get("password"),
                    confirmation: f.get("confirmation"),
                    captcha,
                  });
                  if (r.session) {
                    const x = await supabase!.auth.setSession(r.session);
                    if (x.error) throw x.error;
                    await restore(x.data.session);
                  } else
                    setNotice(
                      "Se o cadastro puder continuar, você receberá instruções no e-mail informado. Se já tem conta, entre para retomar; se necessário, use Esqueci minha senha.",
                    );
                });
              }}
            >
              <h2>Crie sua identidade</h2>
              <label>
                Nome completo
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label>
                Username
                <input
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setEdited(true);
                  }}
                  pattern="[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}"
                  maxLength={61}
                  autoComplete="username"
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                />
              </label>
              <label>
                Sua senha
                <PasswordInput
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirmar senha
                <PasswordInput
                  name="confirmation"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <Captcha onToken={setCaptcha} />
              <p className="sy-signup-next" id="signup-next">
                Depois, você cadastra sua empresa, escolhe o plano e configura
                serviços, horários e identidade visual. Se for solicitada
                confirmação por e-mail, confirme o endereço para continuar.
              </p>
              <button
                aria-describedby="signup-next"
                className="sy-button sy-primary"
                disabled={busy || (captchaConfigured && !captcha)}
              >
                Criar identidade
              </button>
              <Link to={invitationReturn ? "/entrar?retorno=convite-comercial" : "/entrar?retorno=cadastro"}>
                Já tenho conta · Entrar e retomar
              </Link>
            </form>
          ) : identitySetup ? (
            <form
              key="identity"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await accessApi("/access/selfservice-register", {
                    name,
                    username,
                  });
                  setIdentitySetup(false);
                  await restore(session);
                });
              }}
            >
              <h2>Complete sua identidade</h2>
              <p>Sua conta existente será preservada.</p>
              <label>
                Nome completo
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Username
                <input
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setEdited(true);
                  }}
                />
              </label>
              <button disabled={busy}>Salvar identidade</button>
            </form>
          ) : invitationReturn ? (<><h2>Identidade preparada</h2><button onClick={onIdentityReady || (() => window.location.assign("/ativar-empresa"))}>Voltar ao convite de ativação</button></>) : draft?.state === "completed" ? (
            <>
              <h2>Empresa preparada.</h2>
              <p>A configuração inicial continua no ambiente da sua empresa.</p>
              <button
                className="sy-button sy-primary"
                disabled={busy}
                onClick={() => void run(enterCompany)}
              >
                Abrir configuração da empresa
              </button>
            </>
          ) : !draft || editing ? (
            <form
              key="company"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  if (f.get("kind") === "CPF" && !normalizeCPF(f.get("document"))) throw Error("document_invalid");
                  const d = await rpc<any>("selfservice_save", {
                    p_id: draft?.id || null,
                    p_revision: draft?.revision || 0,
                    p_name: company,
                    p_slug: slug,
                    p_phone: f.get("phone"),
                    p_kind: f.get("kind"),
                    p_document: f.get("document"),
                    p_plan: plan,
                    p_key: key.current,
                  });
                  setDraft(d);
                  setEditing(false);
                  key.current = crypto.randomUUID();
                });
              }}
            >
              <h2>Empresa e plano</h2>
              <p>
                Identidade conectada. Seu progresso será associado a esta conta.
              </p>
              <label>
                Nome da empresa
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </label>
              <label>
                Endereço da página
                <input
                  required
                  minLength={2}
                  maxLength={70}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugEdited(true);
                  }}
                />
                <small>/empresa/{slug || "sua-empresa"}</small>
              </label>
              <label>
                Telefone
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  defaultValue={draft?.phone || ""}
                />
              </label>
              <label>
                Tipo de documento
                <select
                  name="kind"
                  defaultValue={draft?.document_kind || "CPF"}
                >
                  <option>CPF</option>
                  <option>CNPJ</option>
                </select>
              </label>
              <label>
                Documento
                <input
                  name="document"
                  inputMode="numeric"
                  required
                  maxLength={20}
                  autoComplete="off"
                />
              </label>
              <p>
                Validamos o formato e a elegibilidade cadastral. Isso não
                representa consulta governamental.
              </p>
              <label>
                Plano
                <select
                  required
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                >
                  <option value="">Escolha explicitamente</option>
                  {choices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {brl(p.version.price_cents)}{" "}
                      {p.version.interval_months === 1
                        ? "/mês"
                        : `a cada ${p.version.interval_months} meses`}
                    </option>
                  ))}
                </select>
              </label>
              {!loading && !choices.length && (
                <p>
                  Nenhum plano está disponível para cadastro online agora.{" "}
                  <Link to="/contato">Fale com a SYZIA</Link>.
                </p>
              )}
              <button className="sy-button sy-primary" disabled={busy || !plan}>
                Salvar e continuar
              </button>
            </form>
          ) : (
            <>
              <h2>
                {["review", "ineligible"].includes(draft.state)
                  ? "Próximo passo do cadastro"
                  : "Confirme as condições"}
              </h2>
              <p>
                <strong>{draft.name}</strong> · {draft.document_masked}
              </p>
              <p>
                Plano {draft.plan.name} · {brl(draft.plan.price_cents)}{" "}
                {draft.plan.interval_months === 1
                  ? "/mês"
                  : `a cada ${draft.plan.interval_months} meses`}
              </p>
              {["review", "ineligible"].includes(draft.state) &&
              !(
                choices.some((p) => p.billing047) &&
                ["previous_identity", "previous_grant"].includes(
                  draft.eligibility,
                )
              ) ? (
                <p>
                  {[
                    "previous_identity",
                    "previous_grant",
                    "previous_review",
                  ].includes(draft.eligibility)
                    ? "O período gratuito já foi utilizado. Não será concedido outro trial. Consulte as opções de contratação."
                    : draft.eligibility === "trial_not_offered"
                      ? "Este plano não oferece período gratuito. Consulte as opções de contratação."
                      : "Precisamos confirmar a elegibilidade com a administração. Seu cadastro está salvo para análise."}{" "}
                  <Link to="/contato">Falar com a SYZIA</Link>.
                </p>
              ) : (
                <>
                  <p>
                    {["previous_identity", "previous_grant"].includes(
                      draft.eligibility,
                    ) ? (
                      "O período gratuito já foi utilizado. A próxima etapa mostrará a contratação mensal sem novo trial."
                    ) : (
                      <>
                        <strong>{draft.plan.trial_days} dias grátis</strong> a
                        partir da confirmação, para empresas elegíveis. A
                        elegibilidade será conferida novamente ao concluir.
                      </>
                    )}
                  </p>
                  <p>
                    Plano {draft.plan.name}: {brl(draft.plan.price_cents)}
                    {draft.plan.interval_months === 1
                      ? "/mês"
                      : ` a cada ${draft.plan.interval_months} meses`}{" "}
                    {choices.some((p) => p.billing047)
                      ? "com meio de pagamento vinculado desde o início. Sua assinatura e eventual período gratuito serão confirmados na próxima etapa."
                      : "na contratação após o período gratuito. Esta confirmação não registra pagamento."}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () =>
                        setDraft(
                          await (activation ? (args:unknown)=>commercialApi("activate",args) : (args:Record<string,unknown>)=>rpc("selfservice_complete",args))({
                            ...(activation ? {p_id:activation.id,p_snapshot:activation.snapshot,p_draft:draft.id,p_reviewed:true} : {p_id:draft.id}),
                            p_revision: draft.revision,
                            p_consent: true,
                            p_conditions: choices.some((p) => p.billing047)
                              ? "billing-047"
                              : "selfservice-040",
                          }),
                        ),
                      );
                    }}
                  >
                    <label className="sy-check">
                      <input type="checkbox" required />
                      <span>
                        Confirmo os dados da empresa e concordo com o plano e as
                        condições do período gratuito apresentadas.
                      </span>
                    </label>
                    <button className="sy-button sy-primary" disabled={busy}>
                      {choices.some((p) => p.billing047)
                        ? "Preparar empresa e vincular meio de pagamento"
                        : "Ativar período grátis e preparar empresa"}
                    </button>
                  </form>
                </>
              )}
              <button type="button" onClick={() => setEditing(true)}>
                Revisar dados e plano
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </div>
      </section>
    </SiteFrame>
  );
}
