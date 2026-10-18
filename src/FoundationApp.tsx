import { Workspace, WorkspaceGroup } from "./workspace/Workspace";
import { globalIdentityLabel, companyIdentityLabel } from "./workspace/identity";
import { ProviderStatus } from "./billing/ProviderStatus";
import { Acquisition } from "./acquisition/Acquisition";
import { ContextChooser } from "./access/ContextChooser";
import { accessApi, companyEntryPath } from "./access/EnterpriseAccess";
import { PeopleAccess, SyziaOperation } from "./access/PeopleAccess";
import {
  PermissionProvider,
  PermissionRoute,
  PermissionTeam,
} from "./permissions/Permissions";
import { Finance } from "./finance/Finance";
import { VerificationGate, VerificationReview } from "./access/Verification";
import { Capabilities } from "./billing/Capabilities";
import {
  SupportBoundary,
  SupportCenter,
  SupportNotice,
} from "./access/Support";
import { PlatformHome } from "./analytics/PlatformOverview";
import { OrganizationAdmin } from "./access/OrganizationAdmin";
import {
  EnterpriseLogin,
  ActivateAccess,
  AdministrativeRecovery,
  ProvisionForm,
  AccessTeam,
} from "./access/EnterpriseAccess";
import { LegalDocument, LegalGate, LegalSettings } from "./access/Legal";
import { IdleSession } from "./access/IdleSession";
import { useDraft, DraftConflict } from "./ui/useDraft";
import { Brand } from "./brand/Brand";
import { platformBrand } from "./brand/platform";
import "./brand/vireloq.css";
import React, {
  useEffect,
  lazy,
  Suspense,
  useState,
  useCallback,
  useRef,
  createContext,
  useContext,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import {
  supabase,
  configured,
  rpc,
  rows,
  errorMessage,
  type Access,
  type Organization,
  type Profile,
  type Member,
  type Attendant,
  type Role,
  type Audit,
  type Status,
} from "./api";
import "./style.css";
import { CompanyExperience } from "./operations/Onboarding";
const Operations = lazy(() =>
  import("./operations/Operations").then((m) => ({ default: m.Operations })),
);
import "./ui/design-system.css";
const Billing = lazy(() =>
  import("./billing/Billing").then((m) => ({ default: m.Billing })),
);
const Analytics = lazy(() =>
  import("./analytics/Analytics").then((m) => ({ default: m.Analytics })),
);
const PublicCompany = lazy(() =>
  import("./consumer/Consumer").then((m) => ({ default: m.PublicCompany })),
);
const MyRequests = lazy(() =>
  import("./consumer/Consumer").then((m) => ({ default: m.MyRequests })),
);
const Tracking = lazy(() =>
  import("./consumer/Consumer").then((m) => ({ default: m.Tracking })),
);
const CompanyPage = lazy(() =>
  import("./consumer/CompanyPage").then((m) => ({ default: m.CompanyPage })),
);
const ConsumerAdmin = lazy(() =>
  import("./consumer/Admin").then((m) => ({ default: m.ConsumerAdmin })),
);
const Commercial = lazy(() =>
  import("./commercial/Commercial").then((m) => ({ default: m.Commercial })),
);
const Central = lazy(() =>
  import("./central/Central").then((m) => ({ default: m.Central })),
);
const CompanyModule = lazy(() =>
  import("./company/Company").then((m) => ({ default: m.CompanyModule })),
);
const PublicFaq = lazy(() =>
  import("./company/Company").then((m) => ({ default: m.PublicFaq })),
);
const Auth = createContext<{
  session: Session | null;
  access: Access | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  session: null,
  access: null,
  loading: true,
  error: "",
  refresh: async () => {},
  logout: async () => {},
});
function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [access, setAccess] = useState<Access | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [verification, setVerification] = useState<any>(null);
  const [legal, setLegal] = useState<{ can_accept: boolean } | null>(null);
  const current = useRef<Session | null>(null),
    generation = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    const s = current.current;
    if (!s) {
      setAccess(null);
      setLoading(false);
      return;
    }
    try {
      if (!s.user.is_anonymous) {
        const state = await rpc<any>("access_session");
        if (token !== generation.current) return;
        if (state.legal_required) {
          setLegal(state);
          setAccess(null);
          return;
        }
        setLegal(null);
        if (state.verification_required) {
          setVerification(state);
          setAccess(null);
          return;
        }
        setVerification(null);
      }
      const data = await rpc<Access>("foundation_context");
      if (
        token === generation.current &&
        current.current?.user.id === data.profile.id
      ) {
        setAccess(data);
        setError("");
      }
    } catch (e) {
      if (token === generation.current) {
        // Transport loss freezes the existing subtree; an explicit denial purges it.
        const msg =
          e instanceof Error
            ? e.message
            : String((e as { message?: string })?.message || "");
        const network =
          /failed to fetch|fetch failed|networkerror|network request failed/i.test(
            msg,
          );
        if (!network) {
          setAccess(null);
          setLegal(null);
          setVerification(null);
        }
        setError(errorMessage(e));
      }
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      const sameIdentity = Boolean(s && current.current?.user.id === s.user.id);
      current.current = s;
      generation.current++;
      setSession(s);
      // TOKEN_REFRESHED / SIGNED_IN on focus must not unmount the same user's editor.
      // Context still refreshes; denied/revoked access remains fail-closed in refresh().
      if (!sameIdentity) {
        setAccess(null);
        setLoading(Boolean(s));
      }
      setError("");
      queueMicrotask(() => void refresh());
    });
    const interval = setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      data.subscription.unsubscribe();
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const logout = async () => {
    const old = current.current;
    if (old)
      void fetch(
        import.meta.env.VITE_SUPABASE_URL + "/rest/v1/rpc/access_session",
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: "Bearer " + old.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_logout: true }),
          keepalive: true,
        },
      ).catch(() => {});
    if (old) {
      try {
        const sid =
          JSON.parse(atob(old.access_token.split(".")[1])).session_id || "";
        localStorage.removeItem("vireloq.activity:" + old.user.id + ":" + sid);
      } catch {}
    }
    setLegal(null);
    setVerification(null);
    generation.current++;
    current.current = null;
    setAccess(null);
    setSession(null);
    setError("");
    await supabase?.auth.signOut({ scope: "local" });
  };
  return (
    <Auth.Provider value={{ session, access, loading, error, refresh, logout }}>
      <IdleSession session={session} onLogout={() => void logout()} />
      {legal ? (
        <LegalGate
          canAccept={legal.can_accept}
          onDone={() => void refresh()}
          onLogout={() => void logout()}
        />
      ) : verification ? (
        <VerificationGate
          org={verification.organization_id}
          canAccept={verification.can_accept}
          onDone={() => void refresh()}
          onLogout={() => void logout()}
        />
      ) : (
        <React.Fragment key={session?.user.id || "visitor"}>
          {children}
        </React.Fragment>
      )}
    </Auth.Provider>
  );
}
function Notice({
  children,
  kind = "info",
}: {
  children: ReactNode;
  kind?: "info" | "error";
}) {
  return (
    <p
      className={`notice ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function PublicFrame({ children, accessState = false }: { children: ReactNode; accessState?: boolean }) {
  return (
    <main className={accessState ? "public ux-access-state" : "public"}>
      <div className="brand">
        <Brand theme={accessState ? "light" : "dark"} />
      </div>
      {children}
      <p className="footnote">
        {platformBrand.name} · {platformBrand.slogan}
      </p>
    </main>
  );
}
function Protected({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const { session, access, loading, error, refresh, logout } = useContext(Auth);
  if (loading)
    return (
      <PublicFrame accessState>
        <Notice>Verificando seu acesso…</Notice>
      </PublicFrame>
    );
  if (!session) return <Navigate to="/entrar" replace />;
  if (!access)
    return (
      <PublicFrame accessState>
        <div className="card">
          <h1>Acesso indisponível</h1>
          <Notice kind="error">
            {error || "Seu acesso não está liberado."}
          </Notice>
          <button onClick={() => void refresh()}>Tentar novamente</button>
          <button onClick={() => void logout()}>Sair</button>
        </div>
      </PublicFrame>
    );
  if (admin && !access.roles.includes("super_admin"))
    return (
      <Shell>
        <h1>Acesso restrito</h1>
        <Notice kind="error">
          Esta área é exclusiva da administração da plataforma.
        </Notice>
        <Link to="/app">Voltar às minhas empresas</Link>
      </Shell>
    );
  return (
    <div key={access.profile.id}>
      {error && (
        <div className="v-connection-block" role="alert">
          <h2>Reconectando com segurança</h2>
          <p>
            Seu rascunho permanece nesta tela. Confirme a conexão para
            continuar.
          </p>
          <button onClick={() => void refresh()}>Tentar novamente</button>
          <button onClick={() => void logout()}>Sair</button>
        </div>
      )}
      <div inert={!!error}>
        <Shell>{children}</Shell>
      </div>
    </div>
  );
}
function Shell({ children }: { children: ReactNode }) {
  const { access, logout, session } = useContext(Auth);
  const accountName =
    access?.profile.display_name ||
    (session?.user.email?.endsWith("@access.vireloq.invalid")
      ? null
      : session?.user.email) ||
    "Minha conta";
  const currentLocation = useLocation();
  const tenantId = currentLocation.pathname.match(/^\/painel\/([^/]+)/)?.[1];
  const tenant = access?.organizations.find((o) => o.id === tenantId);
  const globalAdmin = Boolean(access?.roles.includes("super_admin"));
  const tenantManager =
    tenant?.status === "active" &&
    (globalAdmin ||
      access?.memberships.some(
        (m) =>
          m.organization_id === tenantId &&
          m.role === "admin_empresa" &&
          m.status === "active",
      ));
  return (
    <Workspace accountName={accountName} role={globalIdentityLabel(access)} company={tenant?.name} logout={() => void logout()} globalNavigation={<>
          <NavLink to="/app" end title="Minhas empresas" aria-label="Minhas empresas">
            Minhas empresas
          </NavLink>
          {access?.roles.includes("super_admin") && (
            <WorkspaceGroup id="platform" label="Plataforma SYZIA">
              <NavLink to="/admin/empresas" title="Empresas" aria-label="Empresas">Empresas</NavLink>
              <NavLink to="/admin/equipe" title="Equipe SYZIA" aria-label="Equipe SYZIA">Equipe SYZIA</NavLink>
              <NavLink to="/admin/pessoas" title="Pessoas e acessos" aria-label="Pessoas e acessos">Pessoas e acessos</NavLink>
              <NavLink to="/admin/auditoria" title="Auditoria" aria-label="Auditoria">Auditoria</NavLink>
              <NavLink to="/admin/metricas" title="Métricas da plataforma" aria-label="Métricas da plataforma">Métricas da plataforma</NavLink>
              <NavLink to="/admin/assinaturas" title="Planos e assinaturas" aria-label="Planos e assinaturas">Planos e assinaturas</NavLink>
              <NavLink to="/admin/cobranca" title="Cobrança" aria-label="Cobrança">Cobrança</NavLink>
            </WorkspaceGroup>
          )}
          {(globalAdmin ||
            access?.identity?.permissions.some((p) =>
              p.startsWith("acquisition."),
            )) && <NavLink to="/admin/aquisicao" title="Aquisição" aria-label="Aquisição">Aquisição</NavLink>}
          <NavLink to="/escolher-empresa" title="Trocar contexto" aria-label="Trocar contexto">Trocar contexto</NavLink>
          <NavLink to="/central" title="Atendimento humano" aria-label="Atendimento humano">Atendimento humano</NavLink>
          <NavLink to="/comercial" title="Comercial e retornos" aria-label="Comercial e retornos">Comercial e retornos</NavLink>
          {!globalAdmin && access?.identity?.kind === "syzia_staff" && (
            <NavLink to="/operacao-syzia" title="Minha operação" aria-label="Minha operação">Minha operação</NavLink>
          )}
    </>}>
        {tenant && globalAdmin && (
          <section
            className="v-tenant-context"
            aria-label="Contexto da administração"
          >
            <div>
              <span className="eyebrow">AMBIENTE DA EMPRESA</span>
              <strong>{tenant.name}</strong>
              <span>Administrando como Super Admin da SYZIA</span>
            </div>
            <div className="org-actions">
              <Link to="/admin/empresas">Voltar à Administração SYZIA</Link>
              <Link to="/app">Minhas empresas</Link>
            </div>
          </section>
        )}
        {tenantId && tenant && tenant.status !== "active" ? (
          <section>
            <h1>Empresa indisponível</h1>
            <p>
              Esta empresa está suspensa. Reative-a na Administração SYZIA para
              voltar ao ambiente empresarial.
            </p>
            <Link to="/app">Voltar às minhas empresas</Link>
          </section>
        ) : tenantId && tenant ? (
          globalAdmin ? (
            currentLocation.pathname.endsWith("/assinatura") ? (
              children
            ) : (
              <SupportBoundary
                key={access!.profile.id + tenantId}
                org={tenantId}
              >
                <PermissionProvider
                  key={access!.profile.id + tenantId}
                  org={tenantId}
                >
                  <CompanyExperience org={tenantId} user={access!.profile.id}>
                    <PermissionRoute>
                      <Suspense
                        fallback={
                          <p className="module-loading" role="status">
                            Carregando esta área…
                          </p>
                        }
                      >
                        {children}
                      </Suspense>
                    </PermissionRoute>
                  </CompanyExperience>
                </PermissionProvider>
              </SupportBoundary>
            )
          ) : (
            <PermissionProvider
              key={access!.profile.id + tenantId}
              org={tenantId}
            >
              <CompanyExperience
                key={access!.profile.id + tenantId}
                org={tenantId}
                user={access!.profile.id}
              >
                {tenantManager && <SupportNotice org={tenantId} />}
                <PermissionRoute>
                  <Suspense
                    fallback={
                      <p className="module-loading" role="status">
                        Carregando esta área…
                      </p>
                    }
                  >
                    {children}
                  </Suspense>
                </PermissionRoute>
              </CompanyExperience>
            </PermissionProvider>
          )
        ) : (
          children
        )}
    </Workspace>
  );
}
function Home() {
  const { access } = useContext(Auth);
  const [contextError, setContextError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const openingLock = useRef(false);
  async function openCompany(e: React.MouseEvent, org: string) {
    if (access?.roles.includes("super_admin")) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    if (openingLock.current) return;
    openingLock.current = true;
    setOpening(org);
    setContextError("");
    try {
      const c = await accessApi("/access/contexts", {});
      const a = c.companies.find((x: any) => x.organization_id === org);
      if (a) await accessApi("/access/context", { account_id: a.id });
      window.location.assign(await companyEntryPath(org));
    } catch (e) {
      setContextError(errorMessage(e));
      openingLock.current = false;
      setOpening(null);
    }
  }
  return (
    <>
      {access?.roles.includes("super_admin") && <PlatformHome />}
      <p className="eyebrow">SEU ESPAÇO DE TRABALHO</p>
      <h1>Minhas empresas</h1>
      <p className="muted">
        Escolha sua empresa para ver a agenda, atender clientes e organizar o
        dia.
      </p>
      {contextError && <p role="alert">{contextError}</p>}
      <div className="org-grid">
        {access?.organizations.map((o) => (
          <Link
            className="org-card"
            to={"/painel/" + o.id}
            key={o.id}
            aria-busy={opening === o.id}
            aria-disabled={Boolean(opening)}
            onClick={(e) => void openCompany(e, o.id)}
          >
            <span className="org-avatar">
              {o.name.slice(0, 2).toUpperCase()}
            </span>
            <h2>{o.name}</h2>
            <span className="muted">{o.slug}</span>
            <div className="ux-company-role">{companyIdentityLabel(access, o.id)}</div>
            <p>
              {opening === o.id ? (
                <span role="status">Abrindo empresa…</span>
              ) : (
                <StatusBadge value={o.status} />
              )}
            </p>
          </Link>
        ))}
      </div>
      {access?.organizations.length === 0 && (
        <Notice>
          Você ainda não está vinculado a uma empresa. Peça ao administrador
          responsável que prepare seu acesso empresarial.
        </Notice>
      )}
    </>
  );
}
function StatusBadge({ value }: { value: Status }) {
  return (
    <span className={`status ${value}`}>
      {value === "active" ? "Ativo" : "Suspenso"}
    </span>
  );
}
function useAction() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const { refresh } = useContext(Auth);
  async function act(
    work: () => Promise<unknown>,
    reload?: () => Promise<unknown>,
  ) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await work();
      setMessage("Alteração salva.");
      await refresh();
      await reload?.();
    } catch (e) {
      setFailed(true);
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, failed, act };
}
function ProfilePage() {
  const { access } = useContext(Auth),
    a = useAction();
  return (
    <>
      <h1>Meu perfil</h1>
      <div className="card narrow">
        <p className="muted">
          Mantenha seu nome atualizado. O administrador da empresa prepara seu
          acesso e pode gerar um novo código quando necessário.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void a.act(() =>
              rpc("foundation_update_profile", { p_name: f.get("name") }),
            );
          }}
        >
          <Field label="Seu nome">
            <input
              name="name"
              defaultValue={access?.profile.display_name}
              minLength={2}
              maxLength={120}
              required
            />
          </Field>
          <button className="primary" disabled={a.busy}>
            Salvar nome
          </button>
        </form>
        {a.message && (
          <Notice kind={a.failed ? "error" : "info"}>{a.message}</Notice>
        )}
      </div>
    </>
  );
}
function PeopleSelect({
  people,
  name = "user",
  label = "Pessoa",
}: {
  people: Profile[];
  name?: string;
  label?: string;
}) {
  return (
    <Field label={label}>
      <select name={name} required defaultValue="">
        <option value="" disabled>
          Selecione uma pessoa
        </option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name || p.id}{" "}
            {p.status === "suspended" ? "(suspenso)" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
function StatusSelect() {
  return (
    <Field label="Situação">
      <select name="status">
        <option value="active">Ativo</option>
        <option value="suspended">Suspenso</option>
      </select>
    </Field>
  );
}
function AuditTable({ data }: { data: Audit[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Ação</th>
            <th>Registro</th>
            <th>Campos</th>
            <th>Autor</th>
          </tr>
        </thead>
        <tbody>
          {data.map((x) => (
            <tr key={x.id}>
              <td>{new Date(x.created_at).toLocaleString("pt-BR")}</td>
              <td>{x.action}</td>
              <td>{x.entity_table}</td>
              <td>{x.changed_fields.join(", ")}</td>
              <td>
                <code>{x.actor_id || "Provisionamento"}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && <Notice>Nenhum registro disponível.</Notice>}
    </div>
  );
}
function Organizations() {
  const { refresh } = useContext(Auth);
  return <OrganizationAdmin onChange={refresh} />;
}
function Team() {
  return <PeopleAccess staffOnly />;
}
function OrganizationBasics({
  organization: o,
  global,
  reload,
}: {
  organization: Organization;
  global: boolean;
  reload: () => Promise<unknown>;
}) {
  const draft = useDraft(
    { name: o.name, status: o.status },
    JSON.stringify([o.name, o.status]),
  );
  const action = useAction();
  return (
    <section className="card">
      <h2>Cadastro básico</h2>
      <DraftConflict conflict={draft.conflict} discard={draft.discard} />
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.conflict) return;
          void action.act(
            async () => {
              await rpc("foundation_update_organization", {
                p_org: o.id,
                p_name: draft.value.name,
                p_status: global ? draft.value.status : o.status,
              });
            },
            async () => {
              await reload();
              draft.saved();
            },
          );
        }}
      >
        <Field label="Nome">
          <input
            name="name"
            value={draft.value.name}
            onChange={(e) =>
              draft.set({ ...draft.value, name: e.target.value })
            }
            minLength={2}
            maxLength={120}
            required
          />
        </Field>
        {global && (
          <Field label="Situação">
            <select
              name="status"
              value={draft.value.status}
              onChange={(e) =>
                draft.set({ ...draft.value, status: e.target.value as Status })
              }
            >
              <option value="active">Ativo</option>
              <option value="suspended">Suspenso</option>
            </select>
          </Field>
        )}
        <button disabled={action.busy || draft.conflict}>Salvar empresa</button>
      </form>
      {action.message && (
        <Notice kind={action.failed ? "error" : "info"}>
          {action.message}
        </Notice>
      )}
    </section>
  );
}

function OrgPage() {
  const { orgId } = useParams(),
    { access } = useContext(Auth),
    o = access?.organizations.find((x) => x.id === orgId),
    global = access?.roles.includes("super_admin"),
    manager =
      global ||
      access?.memberships.some(
        (m) =>
          m.organization_id === orgId &&
          m.role === "admin_empresa" &&
          m.status === "active",
      );
  const [members, setMembers] = useState<Member[]>([]),
    [attendants, setAttendants] = useState<Attendant[]>([]),
    [people, setPeople] = useState<Profile[]>([]),
    [audits, setAudits] = useState<Audit[]>([]),
    [err, setErr] = useState(""),
    a = useAction();
  const loadGeneration = useRef(0);
  const allowed = Boolean(o),
    reload = useCallback(async () => {
      const generation = ++loadGeneration.current;
      if (!orgId || !allowed) return;
      const [m, t, p, d] = await Promise.all([
        rows<Member>("organization_members", orgId),
        rows<Attendant>("attendant_organizations", orgId),
        rows<Profile>("profiles"),
        manager ? rows<Audit>("audit_logs", orgId) : Promise.resolve([]),
      ]);
      if (generation !== loadGeneration.current) return;
      setMembers(m);
      setAttendants(t);
      setPeople(p);
      setAudits(d);
    }, [orgId, allowed, manager]);
  useEffect(() => {
    setMembers([]);
    setAttendants([]);
    setPeople([]);
    setAudits([]);
    setErr("");
    void reload().catch((e) => setErr(errorMessage(e)));
    return () => {
      loadGeneration.current++;
    };
  }, [reload]);
  if (!o)
    return (
      <>
        <h1>Empresa indisponível</h1>
        <Notice kind="error">
          A empresa não existe ou você não tem acesso a ela.
        </Notice>
        <Link to="/app">Voltar</Link>
      </>
    );
  const person = (id: string) =>
    people.find((p) => p.id === id)?.display_name || id;
  return (
    <>
      <p className="eyebrow">EMPRESA</p>
      <h1>{o.name}</h1>
      {!global && (
        <Link className="badge" to={"/painel/" + o.id + "/configuracao"}>
          Configurar empresa
        </Link>
      )}
      <div className="org-actions">
        {!global && manager && (
          <Link to={"/painel/" + o.id + "/assinatura"}>
            Plano e utilização ↗
          </Link>
        )}
        {access?.memberships.some(
          (m) =>
            m.organization_id === o.id &&
            m.role === "admin_empresa" &&
            m.status === "active",
        ) && (
          <Link to={"/painel/" + o.id + "/metricas"}>
            Métricas e resultados ↗
          </Link>
        )}
        {!global && manager && (
          <Link to={"/painel/" + o.id + "/operacao"}>
            Indicadores de atendimento ↗
          </Link>
        )}
        <Link to={"/empresa/" + o.slug}>Página pública ↗</Link>
      </div>
      <p className="muted">
        /{o.slug} · <StatusBadge value={o.status} />
      </p>
      {err && <Notice kind="error">{err}</Notice>}
      {manager && (
        <OrganizationBasics
          key={o.id}
          organization={o}
          global={Boolean(global)}
          reload={reload}
        />
      )}
      {global && (
        <>
          <Capabilities org={o.id} global />
          <VerificationReview org={o.id} />
        </>
      )}
      {manager && <PermissionTeam org={o.id} global={Boolean(global)} />}
      <div className="split">
        <section className="card">
          {manager ? (
            <AccessTeam
              key={o.id}
              org={o.id}
              suspended={o.status !== "active"}
            />
          ) : (
            <p>Consulte o administrador para alterações de acesso.</p>
          )}
        </section>
        <section className="card">
          <h2>Atendentes vinculados</h2>
          {attendants.map((t) => (
            <div className="list-row" key={t.user_id}>
              <div>
                <strong>{person(t.user_id)}</strong>
                <small>{t.kind === "primary" ? "Principal" : "Reserva"}</small>
              </div>
              <StatusBadge value={t.status} />
            </div>
          ))}
          {!attendants.length && (
            <p className="muted">Nenhum vínculo disponível.</p>
          )}
          {global && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void a.act(
                  () =>
                    rpc("foundation_set_attendant", {
                      p_org: o.id,
                      p_user: f.get("user"),
                      p_kind: f.get("kind"),
                      p_status: f.get("status"),
                    }),
                  reload,
                );
              }}
            >
              <h3>Definir atendente</h3>
              <PeopleSelect people={people} />
              <Field label="Responsabilidade">
                <select name="kind">
                  <option value="backup">Reserva</option>
                  <option value="primary">Principal</option>
                </select>
              </Field>
              <StatusSelect />
              <button disabled={a.busy}>Salvar atendente</button>
            </form>
          )}
        </section>
      </div>
      {a.message && (
        <Notice kind={a.failed ? "error" : "info"}>{a.message}</Notice>
      )}
      {manager && (
        <section className="card">
          <h2>Histórico de acessos da empresa</h2>
          <p className="muted">Últimos 100 eventos.</p>
          <AuditTable data={audits} />
        </section>
      )}
    </>
  );
}
function AuditPage() {
  const [data, setData] = useState<Audit[]>([]),
    [err, setErr] = useState("");
  useEffect(() => {
    let active = true;
    rpc<Audit[]>("foundation_global_audit")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setErr(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <h1>Auditoria da plataforma</h1>
      <p className="muted">
        Últimos 100 eventos. O histórico registra quem alterou os acessos e os
        campos envolvidos.
      </p>
      {err && <Notice kind="error">{err}</Notice>}
      <section className="card">
        <AuditTable data={data} />
      </section>
    </>
  );
}
function CompanyRoute() {
  const { orgId, section: routeSection } = useParams();
  const current = useLocation();
  const section = routeSection ?? current.pathname.split("/")[3] ?? "";
  const { access } = useContext(Auth);
  const org = access?.organizations.find((o) => o.id === orgId);
  if (org && access?.roles.includes("super_admin") && section === "acessos")
    return <OrgPage />;
  if (!org || org.status !== "active")
    return (
      <>
        <h1>Empresa indisponível</h1>
        <p>Você não tem acesso a esta empresa ativa.</p>
        <Link to="/app">Voltar</Link>
      </>
    );
  const manager =
    access?.roles.includes("super_admin") ||
    access?.memberships.some(
      (m) =>
        m.organization_id === org.id &&
        m.role === "admin_empresa" &&
        m.status === "active",
    );
  if (section === "financeiro") return <Finance org={org.id} />;
  if (section === "permissoes")
    return (
      <PermissionTeam
        org={org.id}
        global={Boolean(access?.roles.includes("super_admin"))}
      />
    );
  if (section === "acessos") return <OrgPage />;
  if (section === "suporte") return <SupportCenter key={org.id} org={org.id} />;
  if (section === "ajuda") return null;
  if (section === "legal") return <LegalSettings org={org.id} />;
  if (section === "pagina") return <CompanyPage key={org.id} org={org} />;
  if (
    [
      "",
      "agenda",
      "clientes",
      "orcamentos",
      "novo-agendamento",
      "novo-orcamento",
    ].includes(section)
  )
    return <Operations key={org.id + section} org={org.id} section={section} />;
  if (section === "atendimento")
    return (
      <Central
        key={org.id + ":atendimento"}
        companyOrg={org.id}
        companyPending={false}
      />
    );
  if (location.pathname.endsWith("/assinatura"))
    return <Billing key={org.id} org={org.id} name={org.name} />;
  if (location.pathname.endsWith("/metricas"))
    return <Analytics key={org.id} org={org.id} name={org.name} />;
  if (location.pathname.endsWith("/operacao"))
    return <Analytics key={org.id} org={org.id} name={org.name} operational />;
  if (location.pathname.endsWith("/comercial"))
    return <Commercial key={org.id} companyOrg={org.id} />;
  if (location.pathname.endsWith("/pendencias"))
    return <Central key={org.id + ":pendencias"} companyOrg={org.id} />;
  if (location.pathname.endsWith("/consumidor"))
    return <ConsumerAdmin org={org.id} name={org.name} />;
  return <CompanyModule key={org.id + access!.profile.id} organization={org} />;
}
export default function Application() {
  if (!configured)
    return (
      <PublicFrame>
        <div className="card">
          <h1>Conexão ainda não configurada</h1>
          <Notice>
            A SYZIA precisa ter o ambiente configurado antes de liberar o
            acesso.
          </Notice>
          <p className="muted">
            Nenhuma conta ou informação empresarial será simulada nesta tela.
          </p>
        </div>
      </PublicFrame>
    );
  return (
    <AuthProvider>
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Routes>
          <Route path="/escolher-empresa" element={<ContextChooser />} />
          <Route
            path="/admin/cobranca"
            element={
              <Protected admin>
                <ProviderStatus />
              </Protected>
            }
          />
          <Route
            path="/admin/aquisicao"
            element={
              <Protected>
                <Acquisition />
              </Protected>
            }
          />

          <Route
            path="/admin/assinaturas"
            element={
              <Protected admin>
                <Billing platform />
              </Protected>
            }
          />
          <Route
            path="/painel/:orgId/assinatura"
            element={
              <Protected>
                <CompanyRoute />
              </Protected>
            }
          />
          <Route path="/ativar-acesso" element={<ActivateAccess />} />
          <Route path="/termos" element={<LegalDocument kind="terms" />} />
          <Route
            path="/privacidade"
            element={<LegalDocument kind="privacy" />}
          />
          <Route path="/entrar" element={<EnterpriseLogin />} />
          <Route
            path="/admin/metricas"
            element={
              <Protected admin>
                <Analytics platform />
              </Protected>
            }
          />
          <Route
            path="/comercial"
            element={
              <Protected>
                <Commercial />
              </Protected>
            }
          />
          <Route
            path="/comercial/:code"
            element={
              <Protected>
                <Commercial />
              </Protected>
            }
          />
          <Route
            path="/central"
            element={
              <Protected>
                <Central />
              </Protected>
            }
          />
          <Route
            path="/central/:code"
            element={
              <Protected>
                <Central />
              </Protected>
            }
          />
          <Route path="/empresa/:slug" element={<PublicCompany />} />
          <Route path="/minhas-solicitacoes" element={<MyRequests />} />
          <Route path="/acompanhar/:code" element={<Tracking />} />
          <Route path="/empresa/:slug/faq" element={<PublicFaq />} />
          <Route
            path="/painel/:orgId/:section"
            element={
              <Protected>
                <CompanyRoute />
              </Protected>
            }
          />
          <Route
            path="/aceitar-convite"
            element={<AdministrativeRecovery legacy />}
          />
          <Route
            path="/app"
            element={
              <Protected>
                <Home />
              </Protected>
            }
          />
          <Route
            path="/perfil"
            element={
              <Protected>
                <ProfilePage />
              </Protected>
            }
          />
          <Route
            path="/painel/:orgId"
            element={
              <Protected>
                <CompanyRoute />
              </Protected>
            }
          />
          <Route
            path="/admin/empresas"
            element={
              <Protected admin>
                <Organizations />
              </Protected>
            }
          />
          <Route
            path="/operacao-syzia"
            element={
              <Protected>
                <SyziaOperation />
              </Protected>
            }
          />
          <Route
            path="/admin/pessoas"
            element={
              <Protected admin>
                <PeopleAccess />
              </Protected>
            }
          />
          <Route
            path="/admin/equipe"
            element={
              <Protected admin>
                <Team />
              </Protected>
            }
          />
          <Route
            path="/admin/auditoria"
            element={
              <Protected admin>
                <AuditPage />
              </Protected>
            }
          />
          <Route
            path="*"
            element={
              <PublicFrame>
                <h1>Página não encontrada</h1>
                <Link to="/app">Voltar ao início</Link>
              </PublicFrame>
            }
          />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
