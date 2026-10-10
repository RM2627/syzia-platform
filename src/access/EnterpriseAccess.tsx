import { PasswordInput } from "../ui/PasswordInput";
import { accessInstructions, firstAccessLink } from "./access-instructions";
import { ExistingPersonLink } from "./PeopleAccess";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase, rpc } from "../api";
import { Brand } from "../brand/Brand";
import { Captcha } from "../Captcha";
export const accessMessages: Record<string, string> = {
  company_code_unavailable:
    "Não foi possível gerar o código único da empresa. Tente novamente; nenhum cadastro duplicado será criado.",
  slug_conflict:
    "Esse endereço público já está em uso. Escolha outro identificador.",
  slug_invalid: "Use letras minúsculas, números e hífens no endereço público.",
  provisioning_incomplete:
    "O cadastro foi preservado, mas a identidade ainda precisa ser preparada. Use Retomar provisionamento.",
  identity_exists_select_person:
    "Esse e-mail já pertence a uma identidade. Selecione a pessoa existente ou solicite o vínculo à administração SYZIA.",
  identity_context_required:
    "Não foi possível entrar por essa identidade. Confira os dados. Se estiver usando um nome de usuário, tente seu e-mail de contato.",
  existing_identity_requires_login:
    "Já existe uma identidade com esse e-mail. Entre para retomar ou criar outra empresa com a mesma conta.",
  billing_provider_not_configured:
    "A etapa de pagamento ainda está em preparação. Seu cadastro foi salvo para retomada.",
  selfservice_quote_expired:
    "As condições precisam ser atualizadas. Salve novamente os dados e confirme o plano.",
  session_expired:
    "Sua sessão expirou ou foi encerrada. Entre novamente e retome a mesma preparação.",
  temporary_code_unavailable:
    "A preparação foi registrada, mas não foi possível confirmar o código de acesso. Abra a empresa para verificar e continuar a configuração.",
  delivery_cooldown: "Aguarde um minuto entre as tentativas de envio.",
  delivery_rate_limited:
    "O limite de cinco envios por hora foi atingido. Tente mais tarde.",
  organization_deleted:
    "Esta empresa já foi excluída. A operação anterior não pode ser repetida.",
  organization_confirmation_required:
    "Digite o nome exato da empresa para confirmar.",
  organization_history_requires_preservation:
    "Esta empresa possui acessos ou histórico que precisam ser preservados. Utilize Desativar.",
  shared_identity_requires_superadmin:
    "Este acesso antigo pertence a mais de uma empresa. Solicite a preparação ou recuperação à administração SYZIA.",
  access_denied: "Não foi possível entrar com os dados informados.",
  access_invalid:
    "Confira os campos. A senha precisa ter entre 12 e 128 caracteres e a confirmação deve coincidir.",
  access_rate_limited:
    "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
  activation_invalid:
    "Não foi possível validar este acesso. Confira o código e use o link da mesma emissão. Se necessário, peça novas instruções ao administrador.",
  activation_uncertain:
    "Não foi possível confirmar a ativação. Peça à administração para verificar o acesso antes de tentar novamente.",
  access_unavailable:
    "Não foi possível concluir agora. Tente novamente mais tarde.",
  username_conflict:
    "Esse usuário já existe nesta empresa. Escolha outro username.",
  access_already_provisioned:
    "O usuário já foi preparado. Use Redefinir acesso para gerar novas instruções.",
  access_change_unavailable:
    "Esta alteração não está disponível para este usuário agora.",
  administrator_email_required:
    "Administradores precisam de um e-mail de contato válido.",
  idempotency_conflict:
    "Esta solicitação já foi registrada com outros dados. Atualize a tela.",
};
export const accessMessage = (e: unknown) => {
  const x = e as { code?: string; message?: string };
  return (
    accessMessages[x.code || ""] ||
    accessMessages[x.message || ""] ||
    "Não foi possível concluir a operação. Confira sua autorização e os dados."
  );
};
export async function accessApi<T = any>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const base = import.meta.env.VITE_PLATFORM_API_URL;
  if (!base) throw Error("access_unavailable");
  const destination = new URL(base);
  if (
    destination.protocol !== "https:" &&
    !(
      destination.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname)
    )
  )
    throw Error("access_unavailable");
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  const response = await fetch(base.replace(/\/$/, "") + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      Error(accessMessages[data.error] ? data.error : "access_unavailable"),
      {
        organization_id: data.organization_id,
        account_id: data.account_id,
        stage: data.stage,
        request_id: data.request_id,
      },
    );
  return data;
}
// Pick an existing module using server permissions after the session context changes.
export async function companyEntryPath(org: string) {
  const base = "/painel/" + org;
  const session = await rpc<any>("access_session");
  if (session.legal_required || session.verification_required) return base;
  const permissions = await rpc<any>("permissions_context", { p_org: org });
  const destinations = [
    ["home.read", ""],
    ["agenda.read", "/agenda"],
    ["central.read", "/atendimento"],
    ["clients.read", "/clientes"],
    ["quotes.read", "/orcamentos"],
    ["followup.read", "/comercial"],
    ["page.read", "/pagina"],
    ["settings.read", "/configuracao"],
    ["billing.manage", "/assinatura"],
  ];
  const entry = destinations.find(
    ([action]) => permissions.actions[action]?.allowed,
  );
  if (entry) return base + entry[1];
  if (
    Object.entries<any>(permissions.actions).some(
      ([key, value]) => key.startsWith("finance.") && value.allowed,
    )
  )
    return base + "/financeiro";
  return base;
}
function Field({ label, ...props }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      {props.type === "password" ? (
        <PasswordInput {...props} />
      ) : (
        <input {...props} />
      )}
    </label>
  );
}
export function AccessFrame({ children }: any) {
  return (
    <main className="public enterprise-access">
      <Brand />
      <section className="card">{children}</section>
      <p className="footnote">SYZIA · Onde tudo se alinha.</p>
      <nav className="auth-links">
        <Link to="/termos">Termos de Uso</Link>
        <Link to="/privacidade">Política de Privacidade</Link>
      </nav>
    </main>
  );
}
export function EnterpriseLogin() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [captcha, setCaptcha] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const data = await accessApi("/access/identity-login", {
        identifier: f.get("identifier"),
        password: f.get("password"),
        captcha,
      });
      const result = await supabase!.auth.setSession(data.session);
      if (result.error) throw result.error;
      if (
        data.identity_setup_required ||
        new URLSearchParams(location.search).get("retorno") === "cadastro"
      )
        window.location.assign("/cadastrar");
      else if (data.contexts?.super_admin)
        navigate("/admin/empresas", { replace: true });
      else if (data.contexts?.global)
        navigate("/operacao-syzia", { replace: true });
      else if (data.organization_id)
        window.location.assign(await companyEntryPath(data.organization_id));
      else
        navigate(
          data.contexts?.companies?.length > 1 ? "/escolher-empresa" : "/app",
          { replace: true },
        );
    } catch (e) {
      setError(accessMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccessFrame>
      <p className="eyebrow">ACESSO EMPRESARIAL</p>
      <h1>Entrar na SYZIA</h1>
      <p>Seu espaço de trabalho, sua equipe e seus clientes.</p>
      <form onSubmit={submit}>
        <Field
          label="E-mail ou usuário"
          name="identifier"
          type="text"
          required
          autoComplete="username"
        />
        <Field
          label="Senha"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <Captcha onToken={setCaptcha} />
        <button className="primary" disabled={busy}>
          {busy ? "Aguarde…" : "Entrar"}
        </button>
      </form>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <nav className="auth-links">
        <Link to="/recuperar-acesso">Recuperar acesso</Link>
        <Link to="/ativar-acesso">Primeiro acesso</Link>
      </nav>
    </AccessFrame>
  );
}
export function ActivateAccess() {
  const { hash } = useLocation();
  return <ActivationForm key={hash} fragment={hash} />;
}
function ActivationForm({ fragment }: { fragment: string }) {
  const [context] = useState(() => {
    const hash = new URLSearchParams(fragment.slice(1));
    const selector = hash.get("access");
    if (selector)
      return /^[A-Za-z0-9_-]{43}$/.test(selector)
        ? { activation_link: selector }
        : null;
    const company_code = hash.get("context"),
      username = hash.get("user");
    return company_code && username ? { company_code, username } : null;
  });
  const [grant, setGrant] = useState(""),
    [reset, setReset] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (!grant) {
        const result = await accessApi("/access/verify", {
          ...context,
          code: f.get("code"),
        });
        setGrant(result.proof);
        setReset(result.reset);
      } else {
        await accessApi("/access/activate", {
          proof: grant,
          password: f.get("password"),
          confirmation: f.get("confirmation"),
        });
        setGrant("");
        setDone(true);
        history.replaceState(history.state, "", location.pathname);
      }
    } catch (e) {
      setError(accessMessage(e));
      // An expired proof can be renewed with the same still-valid link and code.
      if ((e as Error).message === "activation_invalid") setGrant("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccessFrame>
      <h1>
        {done
          ? "Senha definida"
          : grant
            ? reset
              ? "Defina sua nova senha"
              : "Crie sua senha"
            : "Ativar seu acesso"}
      </h1>
      {done ? (
        <>
          <p>Sua senha foi definida. Entre com seu usuário ou e-mail.</p>
          <Link to="/entrar">Entrar</Link>
        </>
      ) : !context ? (
        <p>
          Abra o link de primeiro acesso recebido nas instruções. Se não o
          encontrar, peça ao administrador um novo link e código temporário.
        </p>
      ) : (
        <form key={grant ? "password" : "code"} onSubmit={submit}>
          {grant ? (
            <>
              <p>
                {reset
                  ? "Você está redefinindo seu acesso."
                  : "Seu acesso já foi preparado. Agora escolha sua senha pessoal."}
              </p>
              <Field
                label="Nova senha"
                type="password"
                name="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <Field
                label="Confirmar nova senha"
                type="password"
                name="confirmation"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </>
          ) : (
            <Field
              label="Código temporário"
              name="code"
              required
              maxLength={100}
              autoComplete="off"
            />
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Aguarde…"
              : grant
                ? "Ativar minha conta"
                : "Validar código"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <Link to="/entrar">Voltar ao login</Link>
    </AccessFrame>
  );
}
export function AdministrativeRecovery({
  legacy = false,
}: {
  legacy?: boolean;
}) {
  return (
    <AccessFrame>
      <h1>
        {legacy ? "Acesso por convite descontinuado" : "Recuperar acesso"}
      </h1>
      <p>
        Peça ao administrador da sua empresa um novo link e código temporário em
        Pessoas e acessos → Redefinir acesso. Se você é o administrador inicial,
        procure a administração SYZIA.
      </p>
      <p>
        O código anterior deixa de funcionar. Você define sua própria senha;
        ninguém precisa conhecê-la.
      </p>
      <p>
        Recebeu as novas instruções? Abra o link de primeiro acesso que
        acompanha o código.
      </p>
      <p>
        <Link to="/entrar">Voltar ao login</Link>
      </p>
    </AccessFrame>
  );
}
export function suggestUsername(first: string, last: string) {
  if (!first.trim() || !last.trim()) return "";
  return [first.split(/\s+/)[0], last.trim().split(/\s+/).at(-1)]
    .join(".")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
}
export function suggestSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-$/, "");
}
export function Instructions({ value, onClose }: any) {
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLElement>(null);
  const ready = Boolean(
    value.temporary_code &&
    value.activation_link &&
    value.expires_at &&
    value.stage !== "auth_identity" &&
    value.state !== "reserved",
  );
  useEffect(() => {
    setNotice("");
    if (!ready || !panel.current) return;
    // The credentials are issued once. Bring the existing panel to the operator
    // when it appears or is replaced by a fresh emission, including on mobile.
    panel.current.focus({ preventScroll: true });
    panel.current.scrollIntoView({ block: "start", behavior: "instant" });
  }, [ready, value.activation_link, value.temporary_code]);
  if (!ready) return null;
  const text = accessInstructions(value, location.origin);
  const link = firstAccessLink(value, location.origin);
  async function copy(content: string, label: string) {
    try {
      await navigator.clipboard.writeText(content);
      setNotice(
        label === "Instruções" ? "Instruções copiadas." : label + " copiado.",
      );
    } catch {
      setNotice(
        "Não foi possível copiar automaticamente. Selecione o texto abaixo e copie manualmente.",
      );
    }
  }
  return (
    <section
      className="notice access-instructions"
      ref={panel}
      tabIndex={-1}
      style={{ scrollMarginTop: 16 }}
      aria-label="Instruções de acesso"
    >
      <h3>
        {value.reissued ? "Novo acesso gerado" : "Pessoa criada com sucesso"}
      </h3>
      {value.reissued && (
        <p>
          O código e o link anteriores não são mais válidos. Compartilhe estas
          novas instruções com a pessoa.
        </p>
      )}
      <p>
        Compartilhe com a pessoa correta pelo canal de sua escolha: WhatsApp,
        e-mail, SMS ou outro. Nenhum envio automático é necessário.
      </p>
      <dl>
        <dt>Nome</dt>
        <dd>{value.name || value.administrator_name || value.username}</dd>
        <dt>Usuário</dt>
        <dd>{value.username}</dd>
        <dt>Código temporário</dt>
        <dd>
          <code>{value.temporary_code}</code>
        </dd>
        <dt>Link de primeiro acesso</dt>
        <dd>
          <a href={link}>{link}</a>
        </dd>
      </dl>
      <p>
        Válido até {new Date(value.expires_at).toLocaleString("pt-BR")}. Uso
        único. O código aparece apenas nesta emissão; se perder ou expirar, gere
        um novo código.
      </p>
      <div className="access-copy-actions">
        <button type="button" onClick={() => void copy(text, "Instruções")}>
          Copiar instruções de acesso
        </button>
        <button
          type="button"
          onClick={() => void copy(value.temporary_code, "Código")}
        >
          Copiar código
        </button>
        <button type="button" onClick={() => void copy(link, "Link")}>
          Copiar link
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>Mensagem pronta para compartilhar</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {text}
        </pre>
      </details>
      {value.organization_id && (
        <Link className="button" to={"/painel/" + value.organization_id}>
          Abrir empresa
        </Link>
      )}
      <button type="button" onClick={onClose}>
        Fechar instruções
      </button>
    </section>
  );
}
export function ProvisionForm({
  org,
  existing,
  firstAdmin = false,
  onDone,
  onIssued,
}: any) {
  const [name, setName] = useState(""),
    [surname, setSurname] = useState(""),
    [username, setUsername] = useState(""),
    [edited, setEdited] = useState(false),
    [role, setRole] = useState(
      existing?.role ||
        (org && !firstAdmin ? "colaborador_empresa" : "admin_empresa"),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [value, setValue] = useState<any>(null);
  const [companyName, setCompanyName] = useState(""),
    [slug, setSlug] = useState(""),
    [slugEdited, setSlugEdited] = useState(false),
    [withAdmin, setWithAdmin] = useState(true),
    [partialOrg, setPartialOrg] = useState<string | null>(null);
  useEffect(() => {
    if (!slugEdited) setSlug(suggestSlug(companyName));
  }, [companyName, slugEdited]);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!edited) setUsername(suggestUsername(name, surname));
  }, [name, surname, edited]);
  return (
    <section className="card">
      <h2>
        {existing
          ? "Preparar acesso existente"
          : org
            ? firstAdmin
              ? "Definir administrador"
              : "Novo usuário"
            : "Ativação da empresa"}
      </h2>
      {value ? (
        <>
          {value.state === "awaiting_admin" ? (
            <section aria-label="Empresa preparada">
              <h3>{value.company_name}</h3>
              <p>Aguardando administrador · Sob gestão da SYZIA</p>
              <p>
                Código da empresa: <strong>{value.company_code}</strong>
              </p>
              <div className="org-actions">
                <Link to={"/painel/" + value.organization_id}>
                  Abrir empresa
                </Link>
                <Link to={"/painel/" + value.organization_id + "/acessos"}>
                  Definir administrador
                </Link>
              </div>
              <button
                onClick={() => {
                  setValue(null);
                  setCompanyName("");
                  setSlugEdited(false);
                }}
              >
                Criar outra empresa
              </button>
            </section>
          ) : onIssued ? (
            <>
              <p>Usuário preparado. Confira as instruções de acesso abaixo.</p>
              <button
                onClick={() => {
                  setValue(null);
                  setName("");
                  setSurname("");
                  setEdited(false);
                }}
              >
                Preparar outra pessoa
              </button>
            </>
          ) : (
            <Instructions value={value} onClose={() => setValue(null)} />
          )}
        </>
      ) : (
        <>
          {org && firstAdmin && (
            <ExistingPersonLink org={org} onDone={onDone} />
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const data = await accessApi(
                  !org && !withAdmin
                    ? "/access/create-organization"
                    : "/access/provision",
                  {
                    organization_id: org || null,
                    company_name: f.get("company_name"),
                    slug: f.get("slug"),
                    name,
                    surname,
                    username,
                    role,
                    email: f.get("email"),
                    phone: f.get("phone"),
                    request_key: key.current,
                    existing_user: existing?.user_id || null,
                  },
                );
                setValue(onIssued ? { prepared: true } : data);
                onIssued?.(data);
                key.current = crypto.randomUUID();
                onDone?.();
              } catch (e) {
                setPartialOrg((e as any).organization_id || null);
                onDone?.();
                setError(accessMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {!org && (
              <>
                <Field
                  label="Nome da empresa"
                  name="company_name"
                  value={companyName}
                  onChange={(e: any) => setCompanyName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                />
                <Field
                  label="Identificador no endereço"
                  name="slug"
                  value={slug}
                  onChange={(e: any) => {
                    setSlug(e.target.value);
                    setSlugEdited(true);
                  }}
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  minLength={2}
                  maxLength={70}
                />
                <p className="muted">
                  Endereço público: /empresa/{slug || "nome-da-empresa"}. Este
                  endereço é diferente do código usado no login.
                </p>
                <label className="company-invite-option">
                  <input
                    type="checkbox"
                    checked={withAdmin}
                    onChange={(e) => setWithAdmin(e.target.checked)}
                  />
                  <span>Preparar primeiro administrador agora</span>
                </label>
                {!withAdmin && (
                  <p>
                    A empresa ficará sob gestão da SYZIA até você definir um
                    administrador. Nenhuma conta será criada agora.
                  </p>
                )}
                {withAdmin && <h3>Administrador inicial</h3>}
              </>
            )}
            {(org || withAdmin) && (
              <>
                <Field
                  label="Nome"
                  value={name}
                  onChange={(e: any) => setName(e.target.value)}
                  required
                  maxLength={50}
                />
                <Field
                  label="Sobrenome"
                  value={surname}
                  onChange={(e: any) => setSurname(e.target.value)}
                  required
                  maxLength={60}
                />
                <Field
                  label="Username"
                  value={username}
                  onChange={(e: any) => {
                    setEdited(true);
                    setUsername(e.target.value);
                  }}
                  required
                  maxLength={61}
                />
                {org && !existing && !firstAdmin && (
                  <label className="field">
                    <span>Papel</span>
                    <select
                      aria-label="Papel"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="colaborador_empresa">Colaborador</option>
                      <option value="own_attendant">Atendente próprio</option>
                      <option value="admin_empresa">Administrador</option>
                    </select>
                  </label>
                )}
                <Field
                  label={
                    role === "admin_empresa"
                      ? "E-mail do administrador"
                      : "E-mail (opcional)"
                  }
                  name="email"
                  type="email"
                  required={role === "admin_empresa"}
                  maxLength={254}
                />
                <Field
                  label="Telefone (opcional)"
                  name="phone"
                  type="tel"
                  maxLength={40}
                />
                <p className="muted">
                  A pessoa cria sua própria senha. Esta ação não inicia nem
                  reinicia o trial.
                </p>
              </>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Preparando…"
                : org
                  ? "Criar usuário"
                  : withAdmin
                    ? "Criar e ativar empresa"
                    : "Criar empresa"}
            </button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {partialOrg && (
        <Link to={"/painel/" + partialOrg + "/acessos"}>
          Retomar provisionamento
        </Link>
      )}
    </section>
  );
}
export function AccessTeam({
  org,
  suspended = false,
}: {
  org: string;
  suspended?: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [value, setValue] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [legacy, setLegacy] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const load = () =>
    rpc<any>("access_team", { p_org: org })
      .then(setData)
      .catch((e) => setError(accessMessage(e)));
  useEffect(() => {
    setData(null);
    setValue(null);
    void load();
  }, [org]);
  async function action(a: any, kind: string) {
    if (
      !confirm(
        kind === "reset" || kind === "resend"
          ? "Gerar um novo código? O código anterior será invalidado e as sessões existentes serão encerradas."
          : "Confirmar alteração deste acesso?",
      )
    )
      return;
    setError("");
    setValue(null);
    setBusy(true);
    try {
      if (kind === "reset" || kind === "resume" || kind === "resend")
        setValue(
          await accessApi("/access/" + kind, {
            organization_id: org,
            id: a.id,
          }),
        );
      else await rpc("access_manage", { p_id: a.id, p_action: kind });
      await load();
    } catch (e) {
      setError(accessMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Pessoas e acessos</h2>
      {data?.shared?.length > 0 && (
        <section className="card">
          <h3>Equipe SYZIA · Atendimento compartilhado</h3>
          <p>
            Identidade e credenciais são gerenciadas pela SYZIA. Ajuste a
            autonomia nesta empresa em Permissões por pessoa.
          </p>
          {data.shared.map((a: any) => (
            <article className="list-row" key={a.user_id}>
              <div>
                <strong>{a.name}</strong>
                <p>Equipe SYZIA · Atendimento compartilhado</p>
                <p>
                  Situação nesta empresa:{" "}
                  {a.status === "active"
                    ? "Ativa"
                    : a.status === "unassigned"
                      ? "Sem atribuição ativa"
                      : "Suspensa"}
                </p>
                <p>
                  Atendimento ao cliente:{" "}
                  {a.can_attend && a.can_reply ? "Permitido" : "Não permitido"}{" "}
                  · Escopo: esta empresa
                </p>
                <Link to={"/painel/" + org + "/autonomia"}>
                  Configurar autonomia nesta empresa
                </Link>
                {" · "}
                <Link to={"/painel/" + org + "/permissoes?pessoa=" + a.user_id}>
                  Revisar permissões nesta empresa
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
      {data &&
        !data.accounts.some((a: any) => a.role === "admin_empresa") &&
        !data.legacy.some((a: any) => a.role === "admin_empresa") && (
          <p className="notice">
            Aguardando administrador · Sob gestão da SYZIA
          </p>
        )}
      {data && (
        <p>
          Código da empresa: <strong>{data.company_code}</strong>
        </p>
      )}
      {!suspended && !value && data && (
        <ProvisionForm
          key={String(
            !data.accounts.some((a: any) => a.role === "admin_empresa") &&
              !data.legacy.some((a: any) => a.role === "admin_empresa"),
          )}
          org={org}
          firstAdmin={
            !data.accounts.some((a: any) => a.role === "admin_empresa") &&
            !data.legacy.some((a: any) => a.role === "admin_empresa")
          }
          onDone={load}
          onIssued={setValue}
        />
      )}
      {value && <Instructions value={value} onClose={() => setValue(null)} />}
      <div className="card">
        {data?.accounts.map((a: any) => (
          <article className="list-row access-account" key={a.id}>
            <div>
              <strong>{a.name}</strong>
              <p>
                {a.username} ·{" "}
                {a.role === "admin_empresa"
                  ? "Administrador"
                  : a.role === "own_attendant"
                    ? "Atendente próprio"
                    : "Colaborador"}
              </p>
              <p>
                Atendimento ao cliente:{" "}
                <strong>
                  {a.can_attend && a.can_reply ? "Permitido" : "Não permitido"}
                </strong>{" "}
                · Escopo: esta empresa
              </p>
              <Link to={"/painel/" + org + "/permissoes"}>
                Revisar permissões efetivas
              </Link>
              <small>
                {
                  (
                    {
                      reserved: "Configuração incompleta",
                      pending: a.activated_at
                        ? "Redefinição pendente"
                        : "Aguardando ativação",
                      active: "Ativo",
                      disabled: "Desativado",
                      changing: "Ativação em andamento",
                      uncertain: "Verificação administrativa necessária",
                    } as any
                  )[a.state]
                }
                {a.state === "pending" &&
                  a.code_expires &&
                  new Date(a.code_expires) <= new Date() &&
                  " · Código expirado"}
              </small>
            </div>
            <div>
              {a.delivery && (
                <p className="muted">
                  {a.delivery.state === "accepted"
                    ? "Último envio aceito pelo servidor de e-mail"
                    : a.delivery.state === "sending"
                      ? "Entrega ainda não confirmada"
                      : "Última tentativa de envio falhou"}
                  {a.delivery.state !== "accepted" && a.delivery.accepted_at
                    ? " · Houve um envio anterior"
                    : ""}
                </p>
              )}
              {a.state === "reserved" ? (
                <button
                  disabled={busy || suspended}
                  onClick={() => void action(a, "resume")}
                >
                  Retomar provisionamento
                </button>
              ) : (
                <button
                  disabled={busy || suspended}
                  onClick={() => void action(a, "reset")}
                >
                  {a.state === "pending"
                    ? "Gerar novo código de primeiro acesso"
                    : "Redefinir acesso"}
                </button>
              )}
              <button
                disabled={busy || suspended || a.state === "reserved"}
                onClick={() => setEditing(a)}
              >
                Editar acesso
              </button>
              <button
                disabled={busy || suspended}
                onClick={() =>
                  void action(a, a.state === "disabled" ? "enable" : "disable")
                }
              >
                {a.state === "disabled" ? "Reativar" : "Desativar"}
              </button>
            </div>
          </article>
        ))}
        {!data?.accounts?.length && (
          <p>Nenhum acesso provisionado nesta empresa.</p>
        )}
      </div>
      {editing && (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await rpc("access_manage", {
                p_id: editing.id,
                p_action: "edit",
                p_username: f.get("username"),
                p_email: f.get("email"),
                p_role: f.get("role"),
              });
              setEditing(null);
              await load();
            } catch (e) {
              setError(accessMessage(e));
            }
          }}
        >
          <h3>Editar acesso</h3>
          <Field
            label="Username"
            name="username"
            defaultValue={editing.username}
            required
          />
          <Field
            label="E-mail de contato"
            name="email"
            type="email"
            defaultValue={editing.email || ""}
          />
          <label className="field">
            <span>Papel</span>
            <select name="role" defaultValue={editing.role}>
              <option value="admin_empresa">Administrador</option>
              <option value="colaborador_empresa">Colaborador</option>
              <option value="own_attendant">Atendente próprio</option>
            </select>
          </label>
          <button>Salvar alterações</button>
          <button type="button" onClick={() => setEditing(null)}>
            Cancelar
          </button>
        </form>
      )}
      {!!data?.legacy?.length && (
        <section className="card">
          <h3>Usuários existentes</h3>
          <p>
            Confirme o username e contato antes de preparar o novo acesso. Os
            vínculos e históricos serão preservados.
          </p>
          {data.legacy.map((m: any) => (
            <p key={m.user_id}>
              {m.name || "Usuário existente"} ·{" "}
              {m.role === "admin_empresa"
                ? "Administrador"
                : m.role === "own_attendant"
                  ? "Atendente próprio"
                  : "Colaborador"}{" "}
              · Atendimento ao cliente:{" "}
              {m.can_attend && m.can_reply ? "Permitido" : "Não permitido"} ·
              Escopo: esta empresa{" "}
              <button onClick={() => setLegacy(m)}>Preparar username</button>
            </p>
          ))}
          {legacy && (
            <ProvisionForm
              key={legacy.user_id}
              org={org}
              existing={legacy}
              onDone={load}
              onIssued={setValue}
            />
          )}
        </section>
      )}
      <LegacyInvitationHistory org={org} />
      <Link to={"/painel/" + org + "/legal"}>Legal e privacidade</Link>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function LegacyInvitationHistory({ org }: { org: string }) {
  const [items, setItems] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const { data, error } = await supabase!
      .from("organization_invitations")
      .select("id,name,email,state,expires_at")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    setItems(data || []);
  }
  useEffect(() => {
    setItems([]);
    setError("");
    void load().catch(() =>
      setError("Não foi possível consultar o histórico de convites."),
    );
  }, [org]);
  return (
    <details className="card">
      <summary>Convites anteriores (histórico)</summary>
      <p>
        O acesso atual é preparado com usuário e código temporário. Convites
        antigos não ativam contas. Este histórico permite revogá-los.
      </p>
      {!items.length && !error && <p>Nenhum convite anterior.</p>}
      {items.map((i) => (
        <article className="list-row" key={i.id}>
          <div>
            <strong>{i.name}</strong>
            <p>{i.email}</p>
            <small>
              {i.state === "accepted"
                ? "Aceito anteriormente"
                : i.state === "revoked"
                  ? "Revogado"
                  : new Date(i.expires_at) < new Date()
                    ? "Expirado"
                    : "Pendente — fluxo descontinuado"}
            </small>
          </div>
          {i.state === "pending" && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await rpc("foundation_revoke_invitation", { p_invite: i.id });
                  await load();
                } catch {
                  setError(
                    "Não foi possível revogar. Confira sua autorização.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Revogar convite anterior
            </button>
          )}
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
