import {embeddedEditor} from './editor-bridge';
import { lazy, useEffect, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";
import { Workspace } from "../workspace/Workspace";
import { CompanyExperience } from "../operations/Onboarding";
import {
  PermissionProvider,
  PermissionRoute,
  PermissionTeam,
} from "../permissions/Permissions";
import {
  demoCall,
  demoBuild,
  demoMessage,
  demoOrigin,
  getDemoSession,
  setDemoSession,
  storedDemoSession,
  type DemoSession,
} from "./transport";
import "./demo.css";
const ConsumerAdmin = lazy(() =>
  import("../consumer/Admin").then((m) => ({ default: m.ConsumerAdmin })),
);
const Operations = lazy(() =>
  import("../operations/Operations").then((m) => ({ default: m.Operations })),
);
const Company = lazy(() =>
  import("../company/Company").then((m) => ({ default: m.CompanyModule })),
);
const CompanyPage = lazy(() =>
  import("../consumer/CompanyPage").then((m) => ({ default: m.CompanyPage })),
);
const PublicCompany = lazy(() =>
  import("../consumer/Consumer").then((m) => ({ default: m.PublicCompany })),
);
const Tracking = lazy(() =>
  import("../consumer/Consumer").then((m) => ({ default: m.Tracking })),
);
const MyRequests = lazy(() =>
  import("../consumer/Consumer").then((m) => ({ default: m.MyRequests })),
);
const Central = lazy(() =>
  import("../central/Central").then((m) => ({ default: m.Central })),
);
const Commercial = lazy(() =>
  import("../commercial/Commercial").then((m) => ({ default: m.Commercial })),
);
const Analytics = lazy(() =>
  import("../analytics/Analytics").then((m) => ({ default: m.Analytics })),
);
function DemoTeam() {
  const [people, setPeople] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    demoCall<any[]>("team")
      .then(setPeople)
      .catch((e) => setError(demoMessage(e)));
  useEffect(() => {
    void load();
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await demoCall("team", {
        person: { name: f.get("name"), role: f.get("role") },
      });
      await load();
    } catch (e) {
      setError(demoMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h1>Equipe da demonstração</h1>
      <p>
        Cadastre profissionais fictícios. Os limites demonstrativos e as permissões
        operacionais continuam sendo aplicados.
      </p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={save} className="card">
        <label>
          Nome demonstrativo
          <input name="name" required minLength={2} maxLength={80} />
        </label>
        <label>
          Papel
          <select name="role">
            <option value="colaborador_empresa">Colaborador da empresa</option>
            <option value="own_attendant">Atendente próprio</option>
            <option value="admin_empresa">Administrador da empresa</option>
          </select>
        </label>
        <button disabled={busy}>Adicionar profissional fictício</button>
      </form>
      <ul>
        {people.map((p) => (
          <li key={p.id}>
            {p.display_name} ·{" "}
            {p.role === "admin_empresa" ? "Administrador" : "Colaborador"}
          </li>
        ))}
      </ul>
      <Link to={"/painel/" + getDemoSession()!.organization.id + "/permissoes"}>
        Permissões e disponibilidade
      </Link>
    </section>
  );
}
function CompanyView({ session }: { session: DemoSession }) {
  const { section = "" } = useParams();
  const org = session.organization;
  let content;
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
    content = <Operations org={org.id} section={section} />;
  else if (section === "consumidor")
    content = <ConsumerAdmin org={org.id} name={org.name} />;
  else if (section === "pagina") content = <CompanyPage org={org} />;
  else if (section === "atendimento" || section === "pendencias")
    content = (
      <Central companyOrg={org.id} companyPending={section === "pendencias"} />
    );
  else if (section === "comercial")
    content = <Commercial companyOrg={org.id} />;
  else if (section === "metricas" || section === "operacao")
    content = <Analytics org={org.id} name={org.name} operational />;
  else if (section === "permissoes")
    content = <PermissionTeam org={org.id} global={false} />;
  else if (section === "acessos") content = <DemoTeam />;
  else if (["assinatura", "financeiro", "legal", "suporte"].includes(section))
    content = (
      <section>
        <h1>Ação externa indisponível</h1>
        <p>A demonstração não cria assinaturas, pagamentos ou acessos reais.</p>
      </section>
    );
  else content = <Company organization={org} />;
  return (
    <PermissionProvider org={org.id}>
      <CompanyExperience org={org.id} user={session.personas.company}>
        <PermissionRoute>{content}</PermissionRoute>
      </CompanyExperience>
    </PermissionProvider>
  );
}
// One bootstrap promise per document also handles React StrictMode's effect replay.
let boot: Promise<DemoSession> | null = null;
function bootstrap() {
  return (boot ??= (async () => {
    if (!demoBuild || window.location.origin !== demoOrigin)
      throw Error("demo_origin_not_configured");
    const fragment = new URLSearchParams(window.location.hash.slice(1)),
      editor = fragment.get("editor"),
      invitation = fragment.get("convite");
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    const previous = storedDemoSession(),
      parts = window.location.pathname.split("/"),
      requested = parts[1] === "empresa" ? parts[2] : parts[1];
    if (editor) {if(!embeddedEditor)throw Error("demo_operation_denied");return demoCall<DemoSession>("restore", {}, editor);}
    if (
      previous &&
      (["painel", "acompanhar", "minhas-solicitacoes"].includes(requested) ||
        previous.slug === requested)
    ) {
      try {
        return await demoCall<DemoSession>("restore", {}, previous.token);
      } catch {
        setDemoSession(null);
      }
    } else if (previous) {
      await demoCall("end", {}, previous.token).catch(() => {});
      setDemoSession(null);
    }
    return demoCall<DemoSession>("start", {
      slug: requested,
      ...(invitation ? { invitation } : {}),
    });
  })());
}
export function DemoApp() {
  const [session, setSession] = useState<DemoSession | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    void bootstrap()
      .then((next) => {
        if (!live) return;
        setDemoSession(next);
        setSession(next);
        if (
          next.kind === "editor" &&
          !window.location.pathname.startsWith("/painel/")
        )
          navigate("/painel/" + next.organization.id + "/configuracao", {
            replace: true,
          });
      })
      .catch((e) => {
        if (live) setError(demoMessage(e));
      });
    return () => {
      live = false;
    };
  }, []);
  if (!session)
    return (
      <main className="demo-entry">
        <h1>SYZIA · Demonstração</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">Preparando sua experiência isolada…</p>
        )}
      </main>
    );
  const panel = location.pathname.startsWith("/painel/");
  const publicLink = "/" + session.slug;
  const banner = (
    <div className="demo-bar">
      <strong>
        {session.kind === "editor"
          ? "Preparação da demonstração"
          : "Demonstração interativa"}
      </strong>
      <span>Dados fictícios · sem efeitos externos. Os recursos disponíveis variam conforme o plano contratado.</span>
      <Link to={panel ? publicLink : "/painel/" + session.organization.id}>
        {panel ? "Ver página pública" : "Conhecer o painel"}
      </Link>
      <button
        onClick={() =>
          void demoCall("end").finally(() => {
            setDemoSession(null);
            setSession(null);
            setError("Sessão encerrada.");
          })
        }
      >
        Encerrar
      </button>
    </div>
  );
  if(embeddedEditor) return <><nav className="demo-bar demo-editor-tabs" aria-label="Configuração demonstrativa">
    <NavLink to={"/painel/"+session.organization.id+"/configuracao"}>Configuração</NavLink>
    <NavLink to={"/painel/"+session.organization.id+"/pagina"}>Página pública</NavLink>
    <NavLink to={"/painel/"+session.organization.id+"/consumidor"}>Solicitações</NavLink>
    <NavLink to={"/painel/"+session.organization.id+"/agenda"}>Agenda</NavLink>
  </nav><Routes><Route path="/painel/:orgId/:section?" element={<CompanyView session={session}/>}/><Route path="/:slug" element={<PublicCompany/>}/></Routes></>;
  return (
    <>
      {banner}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {panel ? (
        <Workspace
          accountName="Experiência demonstrativa"
          role="Empresa demonstrativa"
          company={session.organization.name}
          globalNavigation={<Link to={publicLink}>Página demonstrativa</Link>}
          logout={() => {
            setDemoSession(null);
            window.location.assign(publicLink);
          }}
        >
          <Routes>
            <Route
              path="/painel/:orgId/:section?"
              element={<CompanyView session={session} />}
            />
          </Routes>
        </Workspace>
      ) : (
        <Routes>
          <Route path="/:slug" element={<PublicCompany />} />
          <Route path="/empresa/:slug" element={<PublicCompany />} />
          <Route path="/acompanhar/:code" element={<Tracking />} />
          <Route path="/minhas-solicitacoes" element={<MyRequests />} />
          <Route
            path="*"
            element={
              <main>
                <h1>Página indisponível</h1>
                <Link to={publicLink}>Voltar à demonstração</Link>
              </main>
            }
          />
        </Routes>
      )}
    </>
  );
}
