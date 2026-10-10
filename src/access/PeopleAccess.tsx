import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, errorMessage } from "../api";
import {
  accessApi,
  accessMessage,
  accessMessages,
  Instructions,
  suggestUsername,
} from "./EnterpriseAccess";
const roles: Record<string, string> = {
  person: "Pessoa",
  admin_empresa: "Administrador empresarial",
  syzia_staff: "Equipe SYZIA",
  colaborador_empresa: "Colaborador",
  own_attendant: "Atendente próprio",
  atendente: "Atendente SYZIA",
  super_admin: "Super Admin SYZIA",
};
const grants: Record<string, string> = {
  "people.read": "Consultar pessoas",
  "companies.read": "Consultar cadastro das empresas",
  "acquisition.read": "Consultar aquisição SYZIA",
  "acquisition.manage": "Gerenciar leads SYZIA",
  "shared.attend": "Ser atribuído ao atendimento compartilhado",
};
const situation = (p: any) =>
  p.state === "disabled"
    ? "Desativado"
    : p.status !== "active"
      ? "Suspenso"
      : !p.links.some((l: any) => l.status === "active") &&
          p.kind === "admin_empresa"
        ? "Aguardando vínculo"
        : p.state === "pending"
          ? "Aguardando primeiro acesso"
          : p.state === "reserved"
            ? "Preparação pendente"
            : "Ativo";
export function ExistingPersonLink({
  org,
  onDone,
}: {
  org: string;
  onDone?: () => void;
}) {
  const [people, setPeople] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void rpc<any[]>("people_directory")
      .then(setPeople)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <section className="card">
      <h3>Selecionar pessoa existente</h3>
      <p>
        Vincule a mesma identidade a esta empresa. Não será criada outra conta.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await rpc("people_link", {
              p_org: org,
              p_user: f.get("person"),
              p_role: "admin_empresa",
              p_active: true,
            });
            onDone?.();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Pessoa
          <select required name="person">
            <option value="">Selecione</option>
            {people
              .filter(
                (p) =>
                  p.status === "active" &&
                  ["active", "pending"].includes(p.state),
              )
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {p.username}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy}>Vincular como administrador</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function PeopleAccess({
  manage = true,
  staffOnly = false,
}: {
  manage?: boolean;
  staffOnly?: boolean;
}) {
  const [personName, setPersonName] = useState("");
  const [personUsername, setPersonUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  useEffect(() => {
    if (!usernameEdited) {
      const words = personName.trim().split(/\s+/);
      setPersonUsername(
        suggestUsername(words[0] || "", words.slice(1).join(" ")),
      );
    }
  }, [personName, usernameEdited]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [reauthenticate, setReauthenticate] = useState(false);
  function showError(e: unknown) {
    const failure = e as { code?: string; message?: string };
    const code = failure.message || failure.code || "";
    setReauthenticate(code === "session_expired");
    setError(accessMessages[code] ? accessMessage(e) : errorMessage(e));
  }
  const [people, setPeople] = useState<any[]>([]),
    [companies, setCompanies] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [issued, setIssued] = useState<any>(),
    [newPerson, setNewPerson] = useState(false);
  const key = useRef(crypto.randomUUID());
  async function load() {
    setPeople(await rpc<any[]>("people_directory"));
    if (manage) {
      setCompanies(await rpc<any[]>("people_companies"));
      setReservations(await rpc<any[]>("people_reservations"));
    }
  }
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, [manage]);
  async function act(
    fn: () => Promise<any>,
    successNotice = "Alteração salva.",
  ) {
    setBusy(true);
    setError("");
    setReauthenticate(false);
    setNotice("");
    setIssued(undefined);
    try {
      await fn();
      await load();
      setNotice(successNotice);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  const p = people.find((x) => x.id === selected);
  const list = people.filter(
    (p) =>
      (!staffOnly || p.kind === "syzia_staff") &&
      (p.name + " " + (p.username || "") + " " + (p.email || ""))
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (filter === "all" ||
        (filter === "no-company" &&
          !p.links.some((l: any) => l.status === "active")) ||
        situation(p) === filter ||
        (filter === "Aguardando primeiro acesso" && p.state === "pending")),
  );
  return (
    <div className="people-access">
      <header className="page-heading">
        <div>
          <h1>{staffOnly ? "Equipe SYZIA" : "Pessoas e acessos"}</h1>
          <p>
            {staffOnly
              ? "Identidades globais da equipe, permissões e atribuições de atendimento."
              : "Identidades, funções e vínculos empresariais."}
          </p>
        </div>
        {manage && (
          <button className="primary" onClick={() => setNewPerson(!newPerson)}>
            {staffOnly ? "Novo integrante SYZIA" : "Nova pessoa"}
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {reauthenticate && (
        <Link className="button" to="/entrar">
          Entrar novamente
        </Link>
      )}
      {manage &&
        reservations.filter((r) => !staffOnly || r.role === "syzia_staff")
          .length > 0 && (
          <section className="card">
            <h2>Preparações pendentes</h2>
            {reservations
              .filter((r) => !staffOnly || r.role === "syzia_staff")
              .map((r) => (
                <p key={r.id}>
                  {r.name} · {r.username}{" "}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        async () =>
                          setIssued(
                            await accessApi("/access/resume", { id: r.id }),
                          ),
                        "",
                      )
                    }
                  >
                    Retomar provisionamento
                  </button>
                </p>
              ))}
          </section>
        )}
      {issued && (
        <Instructions value={issued} onClose={() => setIssued(undefined)} />
      )}
      {newPerson && manage && (
        <section className="card">
          <h2>
            {staffOnly
              ? "Criar integrante da equipe SYZIA"
              : "Criar pessoa sem empresa"}
          </h2>
          <form
            className="people-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              setReauthenticate(false);
              setNotice("");
              setIssued(undefined);
              try {
                setIssued(
                  await accessApi("/access/person", {
                    name: f.get("name"),
                    username: f.get("username"),
                    email: f.get("email"),
                    phone: f.get("phone"),
                    role: f.get("role"),
                    request_key: key.current,
                  }),
                );
                key.current = crypto.randomUUID();
                setNewPerson(false);
                await load();
              } catch (e) {
                showError(e);
                await load().catch(() => {});
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nome completo
              <input
                name="name"
                required
                minLength={3}
                maxLength={120}
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </label>
            <label>
              Username
              <input
                name="username"
                value={personUsername}
                onChange={(e) => {
                  setPersonUsername(e.target.value);
                  setUsernameEdited(true);
                }}
                placeholder="nome.sobrenome"
                required
                pattern="[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}"
                maxLength={61}
              />
            </label>
            <label>
              E-mail de contato
              <input name="email" type="email" required maxLength={254} />
            </label>
            <label>
              Telefone (opcional)
              <input name="phone" maxLength={40} />
            </label>
            <label>
              Tipo inicial
              <select
                name="role"
                defaultValue={staffOnly ? "syzia_staff" : "person"}
              >
                {!staffOnly && (
                  <>
                    <option value="person">Pessoa sem vínculo</option>
                    <option value="admin_empresa">
                      Futuro administrador empresarial
                    </option>
                  </>
                )}
                <option value="syzia_staff">Funcionário SYZIA</option>
              </select>
            </label>
            <p>
              Você receberá as instruções para compartilhar com a pessoa, que
              criará a própria senha. Nenhuma empresa será criada.
            </p>
            <button disabled={busy} className="primary">
              Criar pessoa
            </button>
          </form>
        </section>
      )}
      <section className="card">
        <div className="people-form">
          <label>
            Buscar pessoa
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, username ou e-mail"
            />
          </label>
          <label>
            Situação
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {[
                ["all", "Todos"],
                ["Ativo", "Ativos"],
                ["Aguardando primeiro acesso", "Aguardando primeiro acesso"],
                ["Aguardando vínculo", "Aguardando vínculo"],
                ["Suspenso", "Suspensos"],
                ["Desativado", "Desativados"],
                ["no-company", "Sem empresa"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Tipo</th>
                <th>Vínculos</th>
                <th>Situação</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>{p.username || "Acesso existente"}</small>
                  </td>
                  <td>{roles[p.kind]}</td>
                  <td>
                    {p.links
                      .filter((l: any) => l.status === "active")
                      .map((l: any) => l.name)
                      .join(", ") || "Sem empresa"}
                  </td>
                  <td>
                    {situation(p)}
                    {p.state === "pending" &&
                      situation(p) !== "Aguardando primeiro acesso" && (
                        <small>Aguardando primeiro acesso</small>
                      )}
                  </td>
                  <td>
                    {p.last_access
                      ? new Date(p.last_access).toLocaleString("pt-BR")
                      : "Ainda não registrado"}
                  </td>
                  <td>
                    <button onClick={() => setSelected(p.id)}>
                      Abrir ficha
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <p>Nenhuma pessoa encontrada.</p>}
      </section>
      {p && (
        <section className="card" aria-label="Ficha da pessoa">
          <button onClick={() => setSelected("")}>Fechar ficha</button>
          <h2>{p.name}</h2>
          <h3>Dados e conta</h3>
          <p>
            {p.username} · {p.email || "E-mail não informado"} ·{" "}
            {p.phone || "Telefone não informado"}
          </p>
          <p>{situation(p)}</p>
          <details>
            <summary>Identificação técnica</summary>
            <code>{p.id}</code>
          </details>
          {manage && p.kind === "syzia_staff" && (
            <details>
              <summary>Editar identidade global</summary>
              <form
                key={p.id + String(p.username)}
                className="people-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(() =>
                    rpc("people_staff_edit", {
                      p_user: p.id,
                      p_name: f.get("name"),
                      p_username: f.get("username"),
                      p_email: f.get("email"),
                      p_phone: f.get("phone"),
                    }),
                  );
                }}
              >
                <label>
                  Nome completo
                  <input
                    name="name"
                    defaultValue={p.name}
                    required
                    minLength={3}
                    maxLength={120}
                  />
                </label>
                <label>
                  Username
                  <input
                    name="username"
                    defaultValue={p.username}
                    required
                    pattern="[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}"
                    maxLength={61}
                  />
                </label>
                <label>
                  E-mail de contato
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={p.email}
                    maxLength={254}
                  />
                </label>
                <label>
                  Telefone
                  <input name="phone" defaultValue={p.phone} maxLength={40} />
                </label>
                <p>
                  A mudança encerra as sessões da identidade. As atribuições
                  empresariais e o histórico permanecem.
                </p>
                <button disabled={busy}>Salvar identidade</button>
              </form>
            </details>
          )}
          <h3>Papéis globais</h3>
          <p>
            {p.roles.map((r: string) => roles[r] || r).join(", ") ||
              "Nenhum papel global"}
          </p>
          {manage && (
            <details>
              <summary>Administrar papel de Super Admin</summary>
              <p>
                Este papel concede administração global. A equipe SYZIA não
                recebe este papel automaticamente.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      p.roles.includes("super_admin")
                        ? "Revogar o papel global de Super Admin desta pessoa?"
                        : "Conceder administração global a esta pessoa?",
                    )
                  )
                    void act(() =>
                      rpc("foundation_set_global_role", {
                        p_user: p.id,
                        p_role: "super_admin",
                        p_active: !p.roles.includes("super_admin"),
                      }),
                    );
                }}
              >
                {p.roles.includes("super_admin")
                  ? "Revogar Super Admin"
                  : "Conceder Super Admin"}
              </button>
            </details>
          )}
          <h3>Permissões globais</h3>
          {p.kind === "syzia_staff" && manage ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(() =>
                  rpc("people_permissions", {
                    p_user: p.id,
                    p_permissions: f.getAll("permissions"),
                  }),
                );
              }}
              key={p.id + JSON.stringify(p.permissions)}
            >
              {Object.entries(grants).map(([v, l]) => (
                <label className="check" key={v}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={v}
                    defaultChecked={p.permissions.includes(v)}
                  />
                  {l}
                </label>
              ))}
              <p>
                Consultar cadastros não concede acesso operacional ou financeiro
                às empresas.
              </p>
              <button disabled={busy}>Salvar permissões globais</button>
            </form>
          ) : (
            <p>
              {p.permissions.map((g: string) => grants[g]).join(", ") ||
                "Nenhuma permissão adicional concedida"}
            </p>
          )}
          {p.kind !== "syzia_staff" && (
            <>
              <h3>Vínculos empresariais</h3>
              {p.links.map((l: any) => (
                <div key={l.id} className="people-link">
                  <strong>{l.name}</strong>
                  <span>
                    {roles[l.role]} ·{" "}
                    {l.status === "active" ? "Ativo" : "Desvinculado"}
                  </span>
                  {manage && (
                    <>
                      <span>
                        Código para entrar nesta empresa: {l.company_code}
                      </span>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              l.status === "active"
                                ? "Desvincular esta pessoa da empresa? A identidade e o histórico serão preservados."
                                : "Reativar este vínculo?",
                            )
                          )
                            void act(() =>
                              rpc("people_link", {
                                p_user: p.id,
                                p_org: l.id,
                                p_role: l.role,
                                p_active: l.status !== "active",
                              }),
                            );
                        }}
                      >
                        {l.status === "active"
                          ? "Desvincular"
                          : "Reativar vínculo"}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {manage && (
                <form
                  className="people-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(() =>
                      rpc("people_link", {
                        p_user: p.id,
                        p_org: f.get("org"),
                        p_role: f.get("role"),
                        p_active: true,
                      }),
                    );
                  }}
                >
                  <label>
                    Empresa
                    <select name="org" required>
                      <option value="">Selecione</option>
                      {companies
                        .filter((c) => c.status === "active")
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Papel empresarial
                    <select name="role">
                      <option value="admin_empresa">
                        Administrador empresarial
                      </option>
                      <option value="colaborador_empresa">Colaborador</option>
                      <option value="own_attendant">Atendente próprio</option>
                    </select>
                  </label>
                  <button disabled={busy}>Vincular pessoa</button>
                  <p>
                    Empresas com administrador responsável exigem suporte
                    autorizado para alterações operacionais.
                  </p>
                </form>
              )}
            </>
          )}
          <h3>Atribuições de atendimento compartilhado</h3>
          {p.assignments.map((a: any) => (
            <p key={a.id}>
              {a.name} · {a.status === "active" ? "Ativo" : "Suspenso"}{" "}
              {manage && (
                <button
                  disabled={
                    busy ||
                    (a.status !== "active" &&
                      !companies.find((c) => c.id === a.id)?.human_support)
                  }
                  onClick={() =>
                    void act(() =>
                      rpc("foundation_set_attendant", {
                        p_org: a.id,
                        p_user: p.id,
                        p_kind: a.kind,
                        p_status:
                          a.status === "active" ? "suspended" : "active",
                      }),
                    )
                  }
                >
                  {a.status === "active"
                    ? "Remover atribuição"
                    : "Reativar atribuição"}
                </button>
              )}
            </p>
          ))}
          {manage && p.permissions.includes("shared.attend") && (
            <form
              className="people-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(() =>
                  rpc("foundation_set_attendant", {
                    p_org: f.get("org"),
                    p_user: p.id,
                    p_kind: f.get("kind"),
                    p_status: "active",
                  }),
                );
              }}
            >
              <label>
                Empresa
                <select required name="org">
                  <option value="">Selecione</option>
                  {companies
                    .filter((c) => c.status === "active" && c.human_support)
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Atribuição
                <select name="kind">
                  <option value="primary">Principal</option>
                  <option value="backup">Reserva</option>
                </select>
              </label>
              <button disabled={busy}>Atribuir atendimento</button>
              <p>
                Depende da capacidade do plano e das autorizações da empresa.
              </p>
            </form>
          )}
          {manage && (
            <>
              <h3>Segurança</h3>
              <button
                disabled={busy}
                onClick={() =>
                  void act(() => rpc("people_revoke", { p_user: p.id }))
                }
              >
                Encerrar sessões
              </button>{" "}
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      p.status === "active"
                        ? "Suspender esta pessoa em todos os acessos?"
                        : "Reativar esta pessoa?",
                    )
                  )
                    void act(() =>
                      rpc("foundation_set_profile_status", {
                        p_user: p.id,
                        p_status:
                          p.status === "active" ? "suspended" : "active",
                      }),
                    );
                }}
              >
                {p.status === "active" ? "Suspender pessoa" : "Reativar pessoa"}
              </button>{" "}
              {p.kind === "syzia_staff" && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        p.state === "disabled"
                          ? "Reativar esta identidade global?"
                          : "Desativar esta identidade global e encerrar suas sessões?",
                      )
                    )
                      void act(() =>
                        rpc("people_staff_state", {
                          p_user: p.id,
                          p_active: p.state === "disabled",
                        }),
                      );
                  }}
                >
                  {p.state === "disabled"
                    ? "Reativar identidade"
                    : "Desativar identidade"}
                </button>
              )}
              {p.account_id && p.state !== "reserved" && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        p.state === "pending"
                          ? "Gerar um novo acesso? O código e o link anteriores serão invalidados."
                          : "Redefinir a senha desta identidade? As sessões serão encerradas em todas as empresas.",
                      )
                    )
                      void act(
                        async () =>
                          setIssued(
                            await accessApi("/access/reset", {
                              id: p.account_id,
                            }),
                          ),
                        "",
                      );
                  }}
                >
                  {p.state === "pending"
                    ? "Gerar novo código de primeiro acesso"
                    : "Redefinir acesso"}
                </button>
              )}
              <h3>Auditoria</h3>
              <ul>
                {p.audit.map((a: any, i: number) => (
                  <li key={i}>
                    {new Date(a.created_at).toLocaleString("pt-BR")} ·{" "}
                    {a.action}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
export function SyziaOperation() {
  const [self, setSelf] = useState<any>(),
    [companies, setCompanies] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void rpc<any>("people_self")
      .then(async (p) => {
        setSelf(p);
        if (p.permissions?.includes("companies.read"))
          setCompanies(await rpc<any[]>("people_companies"));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <>
      <h1>Minha operação</h1>
      {error && <p role="alert">{error}</p>}
      <p>Acesso conforme suas funções e atribuições.</p>
      {self?.permissions?.includes("shared.attend") && (
        <Link to="/central">Abrir Atendimento</Link>
      )}
      {self?.permissions?.includes("people.read") && (
        <PeopleAccess manage={false} />
      )}{" "}
      {!!companies.length && (
        <section className="card">
          <h2>Cadastro das empresas</h2>
          {companies
            .filter((c) => c.status === "active" && c.human_support)
            .map((c) => (
              <p key={c.id}>
                {c.name} · {c.status === "active" ? "Ativa" : "Suspensa"}
              </p>
            ))}
        </section>
      )}
      {self && !self.permissions.length && (
        <p>
          Nenhuma permissão global foi concedida. Aguarde a definição da sua
          função.
        </p>
      )}
    </>
  );
}
