import { EmployeeAvailability } from "../availability/Availability";
import { useFinancialCommand } from "../finance/useFinancialCommand";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { rpc, errorMessage } from "../api";
export type PermissionData = {
  role: string;
  timezone?: string;
  homologation?: { notice: string; name: string };
  actions: Record<string, { allowed: boolean; scope: string }>;
};
const Context = createContext<PermissionData | null>(null);
export const usePermissions = () => {
  const data = useContext(Context);
  return {
    data,
    can: (action: string) => Boolean(data?.actions[action]?.allowed),
  };
};
export const sectionAction: Record<string, string> = {
  "": "home.read",
  ajuda: "settings.read",
  configuracao: "settings.read",
  servicos: "services.read",
  manual: "settings.read",
  faq: "settings.read",
  respostas: "settings.read",
  regras: "settings.read",
  autonomia: "settings.read",
  prontidao: "settings.read",
  pagina: "page.read",
  consumidor: "agenda.read",
  agenda: "agenda.read",
  clientes: "clients.read",
  orcamentos: "quotes.read",
  "novo-agendamento": "agenda.manage",
  "novo-orcamento": "quotes.manage",
  atendimento: "central.read",
  pendencias: "pending.read",
  comercial: "followup.read",
  metricas: "analytics.operational",
  operacao: "analytics.operational",
  acessos: "people.read",
  permissoes: "people.manage",
  assinatura: "billing.manage",
  suporte: "people.manage",
  legal: "settings.manage",
};
export function PermissionProvider({
  org,
  children,
}: {
  org: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<PermissionData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const x = await rpc<PermissionData>("permissions_context", {
          p_org: org,
        });
        if (current) {
          setData((previous) =>
            JSON.stringify(previous) === JSON.stringify(x) ? previous : x,
          );
          setError("");
        }
      } catch (e) {
        if (current) {
          setData(null);
          setError(errorMessage(e));
        }
      }
    }
    void load();
    const t = setInterval(load, 15000);
    window.addEventListener("focus", load);
    return () => {
      current = false;
      clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, [org]);
  if (error)
    return (
      <p role="alert" className="notice error">
        {error}
      </p>
    );
  if (!data) return <p role="status">Verificando permissões da empresa…</p>;
  return (
    <Context.Provider value={data}>
      {data.homologation && (
        <p className="notice b-homologation-banner" role="status">
          <strong>{data.homologation.notice}</strong>
          <br />
          {data.homologation.name}
        </p>
      )}
      {children}
    </Context.Provider>
  );
}
export function PermissionRoute({ children }: { children: ReactNode }) {
  const { can, data } = usePermissions(),
    location = useLocation(),
    section = location.pathname.split("/")[3] || "";
  const legacyWriteDenied =
    ["novo-agendamento", "novo-orcamento"].includes(section) &&
    ["own_attendant", "shared_attendant"].includes(data?.role || "");
  const allowed =
    !legacyWriteDenied &&
    (section === "financeiro"
      ? can("analytics.financial") ||
        Object.keys(data?.actions || {}).some(
          (a) => a.startsWith("finance.") && can(a),
        )
      : section === "pagina"
        ? can("page.read") || can("portfolio.read")
        : can(sectionAction[section] || "settings.read"));
  if (!allowed)
    return (
      <section className="card">
        <h1>Acesso não disponível</h1>
        <p>
          Esta área não está liberada para seu acesso e para o plano atual da
          empresa.
        </p>
        <Link to="/app">Voltar às minhas empresas</Link>
      </section>
    );
  return <>{children}</>;
}
export function PermissionTeam({
  org,
  global: _global = false,
}: {
  org: string;
  global?: boolean;
}) {
  const command = useFinancialCommand();
  const [params] = useSearchParams();
  const [data, setData] = useState<any>(null),
    [person, setPerson] = useState(""),
    [grants, setGrants] = useState<
      Record<string, { granted: boolean; scope: string }>
    >({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = async () => {
    const d = await rpc<any>("permissions_team", { p_org: org });
    setData(d);
    return d;
  };
  useEffect(() => {
    void load()
      .then((d) => {
        const id = params.get("pessoa");
        if (id && d.members.some((m: any) => m.user_id === id)) choose(id, d);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [org]);
  const member = data?.members.find((m: any) => m.user_id === person);
  function choose(id: string, d = data) {
    setPerson(id);
    const m = d.members.find((m: any) => m.user_id === id);
    setGrants(
      Object.fromEntries(
        (m?.grants || []).map((g: any) => [
          g.action,
          { granted: g.granted, scope: g.scope },
        ]),
      ),
    );
    setMessage("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await command("permissions_save", {
        p_org: org,
        p_user: person,
        p_revision: member.revision,
        p_grants: data.catalog
          .filter((c: any) => c.roles.includes(member.role))
          .map((c: any) => ({
            action: c.action,
            scope: grants[c.action]?.scope || "organization",
            granted: grants[c.action]?.granted || false,
          })),
        p_key: crypto.randomUUID(),
      });
      const d = await load();
      choose(person, d);
      setMessage(
        "Permissões salvas. A alteração já vale para as sessões abertas.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Permissões por pessoa</h2>
      <p>
        Escolha o que cada pessoa pode consultar e fazer. O plano e os limites
        da função continuam valendo.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <label className="field">
        Pessoa
        <select value={person} onChange={(e) => choose(e.target.value)}>
          <option value="">Selecione</option>
          {data?.members
            .filter(
              (m: any) => !["admin_empresa", "super_admin"].includes(m.role),
            )
            .map((m: any) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name} ·{" "}
                {m.role === "shared_attendant"
                  ? "Atendimento compartilhado"
                  : m.role === "own_attendant"
                    ? "Atendente próprio"
                    : "Colaborador"}
              </option>
            ))}
        </select>
      </label>
      {member && (
        <p className="notice">
          {member.role === "shared_attendant"
            ? "Atendente SYZIA atribuído: altere apenas as permissões desta empresa. Identidade, senha e suspensão global são administradas pela SYZIA."
            : "O papel de colaborador não concede atendimento automaticamente."}
          <br />
          Pode assumir atendimento:{" "}
          <strong>{member.can_attend ? "Sim" : "Não"}</strong> · Pode responder:{" "}
          <strong>{member.can_reply ? "Sim" : "Não"}</strong>
        </p>
      )}
      <EmployeeAvailability org={org} data={data?.availability} />
      {member && (
        <form onSubmit={save}>
          <fieldset disabled={busy} className="form-reset">
            {Array.from(
              new Set<string>(data.catalog.map((c: any) => c.module)),
            ).map((module) => (
              <details key={module} open={module === "finance"}>
                <summary>
                  {(
                    {
                      home: "Início",
                      clients: "Clientes",
                      central: "Atendimento",
                      quotes: "Orçamentos",
                      agenda: "Agenda",
                      pending: "Pendências",
                      followup: "Retornos",
                      services: "Serviços",
                      portfolio: "Portfólio",
                      page: "Página pública",
                      settings: "Configurações",
                      analytics: "Métricas",
                      finance: "Financeiro",
                    } as Record<string, string>
                  )[module] || module}
                </summary>
                {data.catalog
                  .filter(
                    (c: any) =>
                      c.module === module && c.roles.includes(member.role),
                  )
                  .map((c: any) => (
                    <div className="permission-row" key={c.action}>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={!!grants[c.action]?.granted}
                          onChange={(e) =>
                            setGrants((g) => ({
                              ...g,
                              [c.action]: {
                                scope:
                                  member.role === "shared_attendant" &&
                                  c.scopes.includes("assigned")
                                    ? "assigned"
                                    : g[c.action]?.scope || "organization",
                                granted: e.target.checked,
                              },
                            }))
                          }
                        />
                        {c.label}
                      </label>
                      {c.scopes.length > 1 && (
                        <select
                          aria-label={"Escopo: " + c.label}
                          value={grants[c.action]?.scope || "organization"}
                          onChange={(e) =>
                            setGrants((g) => ({
                              ...g,
                              [c.action]: {
                                granted: g[c.action]?.granted || false,
                                scope: e.target.value,
                              },
                            }))
                          }
                        >
                          {member.role !== "shared_attendant" && (
                            <option value="organization">Toda a empresa</option>
                          )}
                          <option value="assigned">Cobranças atribuídas</option>
                        </select>
                      )}
                    </div>
                  ))}
              </details>
            ))}
            <p className="muted">
              Consultar uma cobrança ou registrar um recebimento não libera
              caixa, despesas ou métricas financeiras.
            </p>
            <button className="primary" disabled={busy}>
              Salvar permissões
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
