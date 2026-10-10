import { ServiceRelations } from "./ServiceRelations";
import { ImageUpload } from "../consumer/CompanyMedia";
import { PaymentMethods } from "./PaymentMethods";
import "../consumer/presence-editor.css";
import { usePermissions } from "../permissions/Permissions";
import { Categories } from "./Categories";
import { useDraft, DraftConflict } from "../ui/useDraft";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  cloneElement,
  useId,
  type ReactElement,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { rpc, errorMessage, type Organization } from "../api";
import {
  type CompanyData,
  type Row,
  type Hours,
  type Manual,
  sections,
  ruleLabels,
  actionLabels,
  checklistLabels,
  priceLabel,
  parseMoney,
} from "./model";
import "./company.css";
type State = {
  data: CompanyData;
  busy: boolean;
  save: (
    entity: string,
    id: string | null,
    data: Record<string, unknown>,
    revision: number,
  ) => Promise<boolean>;
  act: (name: string, args: Record<string, unknown>) => Promise<boolean>;
  reload: () => Promise<void>;
  org: Organization;
};
const Company = createContext<State>(null!);
const useCompany = () => useContext(Company);
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <label className="field">
      <span id={id}>{label}</span>
      {cloneElement(children as ReactElement<{ "aria-labelledby"?: string }>, {
        "aria-labelledby": id,
      })}
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check-field">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function CompanyModule({
  organization,
}: {
  organization: Organization;
}) {
  const { section = "configuracao" } = useParams();
  const { can } = usePermissions();
  const editable = can(
    section === "servicos" ? "services.manage" : "settings.manage",
  );
  const [data, setData] = useState<CompanyData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    mounted = useRef(true);
  const reload = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const result = await rpc<CompanyData>("company_context", {
        p_org: organization.id,
      });
      if (mounted.current && generation.current === gen) {
        setData({
          ...result,
          editable,
        });
        setError("");
      }
    } catch (e) {
      if (mounted.current && generation.current === gen) {
        setData(null);
        setError(errorMessage(e));
      }
    }
    // The context already contains all configuration sections. Navigation inside
    // this mounted company reuses it; mutations, polling and permission changes
    // still refresh it, with the original revision checks on every write.
  }, [organization.id, editable]);
  useEffect(() => {
    mounted.current = true;
    setData(null);
    void reload();
    const poll = setInterval(() => void reload(), 15000);
    return () => {
      mounted.current = false;
      generation.current++;
      clearInterval(poll);
    };
  }, [reload]);
  async function act(name: string, args: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc(name, { p_org: organization.id, ...args });
      if (!mounted.current) return false;
      await reload();
      setMessage(
        name === "company_publish_manual"
          ? "Versão publicada no manual da empresa."
          : "Alteração salva.",
      );
      return true;
    } catch (e) {
      if (mounted.current) {
        setError(errorMessage(e));
        if ((e as { code?: string }).code === "42501") setData(null);
      }
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const save = (
    entity: string,
    id: string | null,
    payload: Record<string, unknown>,
    revision: number,
  ) =>
    act("company_save", {
      p_entity: entity,
      p_id: id,
      p_expected_revision: revision,
      p_data: payload,
    });
  const tabs = [
    ["configuracao", "Configuração"],
    ["servicos", "Serviços"],
    ["manual", "Manual"],
    ["faq", "FAQ"],
    ["respostas", "Respostas rápidas"],
    ["regras", "Regras"],
    ["autonomia", "Autonomia"],
    ["prontidao", "Prontidão"],
  ];
  return (
    <div className="company-module">
      <div className="company-heading">
        <div>
          <p className="eyebrow">ESPAÇO DA EMPRESA</p>
          <h1>{organization.name}</h1>
          <p className="muted">
            Informações claras para um atendimento consistente.
          </p>
        </div>
        <Link className="badge" to={"/painel/" + organization.id + "/acessos"}>
          Pessoas e acessos
        </Link>
      </div>
      <nav className="company-tabs" aria-label="Configuração da empresa">
        <NavLink to={"/painel/" + organization.id + "/pagina"}>
          Página da empresa
        </NavLink>
        {tabs
          .filter(([path]) =>
            can(path === "servicos" ? "services.read" : "settings.read"),
          )
          .map(([path, label]) => (
            <NavLink key={path} to={"/painel/" + organization.id + "/" + path}>
              {label}
            </NavLink>
          ))}
      </nav>
      {error && (
        <div role="alert" className="notice error">
          {error}{" "}
          <button onClick={() => void reload()}>Recarregar dados</button>
        </div>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!data ? (
        !error && <p role="status">Carregando empresa…</p>
      ) : (
        <Company.Provider
          value={{ data, busy, save, act, reload, org: organization }}
        >
          {!data.editable && (
            <p className="notice">
              Acesso de consulta. Configurações e publicações são
              responsabilidade da administração empresarial.
            </p>
          )}
          {!data.settings ? (
            <section className="card">
              <h2>Vamos organizar sua empresa</h2>
              <p>
                Cadastre os dados e serviços da empresa. O Manual é opcional
                para orientar sua equipe.
              </p>
              {data.editable ? (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void act("company_initialize", {})}
                >
                  Iniciar configuração
                </button>
              ) : (
                <p>A empresa ainda não iniciou a configuração.</p>
              )}
            </section>
          ) : (
            <div key={organization.id + section}>
              {section === "configuracao" ? (
                <Configuration />
              ) : section === "servicos" ? (
                <Catalog />
              ) : section === "manual" ? (
                <ManualEditor />
              ) : section === "faq" ? (
                <FaqEditor />
              ) : section === "respostas" ? (
                <Replies />
              ) : section === "regras" ? (
                <Rules />
              ) : section === "autonomia" ? (
                <Permissions />
              ) : section === "prontidao" ? (
                <Readiness />
              ) : (
                <p>Seção não encontrada.</p>
              )}
            </div>
          )}
        </Company.Provider>
      )}
    </div>
  );
}
function HoursEditor({
  value,
  onChange,
  label,
}: {
  value: Hours;
  onChange: (v: Hours) => void;
  label: string;
}) {
  const days = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  return (
    <fieldset className="hours">
      <legend>{label}</legend>
      <p className="muted">
        Horário de Recife. Uma faixa por dia; desmarque dias sem atendimento.
      </p>
      {days.map((name, day) => {
        const entry = value.find((v) => v.day === day);
        return (
          <div className="hours-row" key={day}>
            <Check
              label={name}
              checked={!!entry}
              onChange={(v) =>
                onChange(
                  v
                    ? [...value, { day, open: "08:00", close: "18:00" }].sort(
                        (a, b) => a.day - b.day,
                      )
                    : value.filter((v) => v.day !== day),
                )
              }
            />
            {entry && (
              <>
                <input
                  aria-label={label + " — " + name + " início"}
                  type="time"
                  required
                  value={entry.open}
                  onChange={(e) =>
                    onChange(
                      value.map((v) =>
                        v.day === day ? { ...v, open: e.target.value } : v,
                      ),
                    )
                  }
                />
                <span>até</span>
                <input
                  aria-label={label + " — " + name + " fim"}
                  type="time"
                  required
                  value={entry.close}
                  onChange={(e) =>
                    onChange(
                      value.map((v) =>
                        v.day === day ? { ...v, close: e.target.value } : v,
                      ),
                    )
                  }
                />
              </>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
function Configuration() {
  const { data } = useCompany();
  return (
    <>
      <Progress />
      <ConfigurationForm />
    </>
  );
}
function ConfigurationForm() {
  const { data, busy, save, act, org } = useCompany();
  const draft = useDraft(data.settings!, data.settings!.revision);
  const c = draft.value,
    business = c.business_hours,
    human = c.human_hours;
  const setBusiness = (hours: Hours) =>
    draft.set({ ...c, business_hours: hours });
  const setHuman = (hours: Hours) => draft.set({ ...c, human_hours: hours });
  const [err, setErr] = useState("");
  const labels: Record<string, string> = {
    legal_name: "Razão social ou nome empresarial",
    description: "Descrição do negócio",
    public_phone: "Telefone público",
    public_email: "E-mail público",
    public_address: "Endereço público",
    service_regions: "Regiões atendidas",
    payment_methods: "Formas de pagamento",
    exception_contact_name: "Responsável por exceções",
    exception_contact: "Contato interno do responsável",
  };
  const limits: Record<string, number> = {
    legal_name: 180,
    description: 4000,
    public_phone: 40,
    public_email: 254,
    public_address: 500,
    service_regions: 2000,
    payment_methods: 2000,
    exception_contact_name: 120,
    exception_contact: 500,
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    if ([...business, ...human].some((h) => h.open >= h.close)) {
      setErr("O encerramento precisa ser posterior à abertura.");
      return;
    }
    const f = new FormData(e.currentTarget);
    if (
      await save(
        "settings",
        null,
        {
          ...Object.fromEntries(
            Object.keys(labels).map((k) => [k, String(f.get(k) || "")]),
          ),
          business_hours: business,
          human_hours: human,
        },
        draft.revision,
      )
    )
      draft.saved();
  }
  return (
    <section className="card">
      <h2>Informações e funcionamento</h2>
      <details className="op-context-help">
        <summary>Como sua empresa quer atender?</summary>
        <p>
          Escolha a equipe que poderá representar sua empresa. Para atendimento
          compartilhado, prepare o manual e os limites de autonomia. Alterar a
          modalidade desativa o atendimento até uma nova revisão de prontidão.
        </p>
        <label>
          Modalidade de atendimento
          <select
            aria-label="Modalidade de atendimento"
            disabled={busy || !data.editable}
            value={String(c.support_mode || "shared")}
            onChange={(e) =>
              void act("operations_support_mode", {
                p_org: org.id,
                p_mode: e.target.value,
                p_revision: c.revision,
              })
            }
          >
            <option value="own">Equipe própria</option>
            <option value="shared">Equipe compartilhada</option>
            <option value="mixed">Equipe própria e compartilhada</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !data.editable}
          onClick={() =>
            void act("operations_support_mode", {
              p_org: org.id,
              p_mode: String(c.support_mode || "shared"),
              p_revision: c.revision,
            })
          }
        >
          Confirmar modalidade
        </button>
      </details>
      <p className="muted">
        O contato de exceções é interno. Os campos identificados como públicos
        podem ser utilizados na apresentação da empresa.
      </p>
      {err && (
        <p role="alert" className="notice error">
          {err}
        </p>
      )}
      <DraftConflict conflict={draft.conflict} discard={draft.discard} />
      <form onSubmit={submit}>
        <fieldset disabled={!data.editable || busy} className="form-reset">
          <div className="form-grid">
            {Object.entries(labels).map(([k, label]) =>
              k === "payment_methods" ? (
                <PaymentMethods
                  key={k}
                  value={String(c.payment_methods || "")}
                  onChange={(value) =>
                    draft.set({ ...c, payment_methods: value })
                  }
                />
              ) : (
                <Field key={k} label={label}>
                  {[
                    "description",
                    "service_regions",
                    "payment_methods",
                  ].includes(k) ? (
                    <textarea
                      name={k}
                      rows={3}
                      maxLength={limits[k]}
                      value={String(c[k] || "")}
                      onChange={(e) => draft.set({ ...c, [k]: e.target.value })}
                    />
                  ) : (
                    <input
                      name={k}
                      type={k === "public_email" ? "email" : "text"}
                      maxLength={limits[k]}
                      value={String(c[k] || "")}
                      onChange={(e) => draft.set({ ...c, [k]: e.target.value })}
                    />
                  )}
                </Field>
              ),
            )}
          </div>
          <div className="form-grid">
            <span id="horarios" />
            <HoursEditor
              label="Horários da empresa"
              value={business}
              onChange={setBusiness}
            />
            <HoursEditor
              label="Horários do atendimento humano"
              value={human}
              onChange={setHuman}
            />
          </div>
          {data.editable && (
            <button className="primary">Salvar configuração</button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
function Progress() {
  const { data } = useCompany();
  const entries = Object.values(data.checklist),
    done = entries.filter(Boolean).length,
    percent = entries.length ? Math.round((done / entries.length) * 100) : 0;
  return (
    <div className="progress-card">
      <div>
        <strong>{data.settings?.support_configured && data.settings.support_mode !== "own" ? "Suporte compartilhado" : "Configuração"} {percent}% concluída</strong>
        <span>
          {done} de {entries.length} verificações atendidas
        </span>
      </div>
      <progress
        value={done}
        max={entries.length || 1}
        aria-label="Progresso da configuração"
      />
    </div>
  );
}
type Descriptor = {
  key: string;
  label: string;
  type?:
    "textarea" | "number" | "checkbox" | "select" | "money" | "options" | "url";
  options?: [string, string][];
  required?: boolean;
  max?: number;
  min?: number;
};
function RecordForm({
  entity,
  row,
  fields,
  defaults = {},
  extra = {},
  onDone,
}: {
  entity: string;
  row?: Row;
  fields: Descriptor[];
  defaults?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  onDone?: () => void;
}) {
  const { data, busy, save, org, reload } = useCompany();
  const draft = useDraft<Record<string, unknown>>(
    {
      ...defaults,
      ...row,
      ...extra,
      contract_mode:
        row?.contract_mode ||
        (row?.direct_booking ? "immediate" : row ? "evaluation" : "immediate"),
      execution_mode: row?.execution_mode || "continuous",
      price_max_cents:
        row?.price_max_cents == null
          ? ""
          : (Number(row.price_max_cents) / 100).toFixed(2).replace(".", ","),
      condition_value:
        row?.condition_value == null ? "" : String(row.condition_value),
      price_cents:
        row?.price_cents == null
          ? ""
          : (Number(row.price_cents) / 100).toFixed(2).replace(".", ","),
      options: Array.isArray(row?.options) ? row.options.join("\n") : "",
    },
    data.settings!.revision,
  );
  const values = draft.value,
    setValues = draft.set;
  const [err, setErr] = useState("");
  const [newCategory, setNewCategory] = useState(false),
    [categoryName, setCategoryName] = useState(""),
    [categoryBusy, setCategoryBusy] = useState(false),
    [imageBusy, setImageBusy] = useState(false),
    [imageChanged, setImageChanged] = useState(false);
  async function createCategory() {
    if (categoryName.trim().length < 1) return;
    setCategoryBusy(true);
    setErr("");
    try {
      const before = await rpc<CompanyData>("company_context", {
        p_org: org.id,
      });
      if (before.settings!.revision !== draft.revision) {
        setErr(
          "Há uma alteração mais recente. Seu rascunho foi preservado; revise a atualização antes de criar a categoria.",
        );
        return;
      }
      const result = await rpc<{ id: string }>("company_category_save", {
        p_org: org.id,
        p_id: null,
        p_revision: 0,
        p_data: { name: categoryName.trim() },
        p_key: crypto.randomUUID(),
      });
      const after = await rpc<CompanyData>("company_context", {
        p_org: org.id,
      });
      const category = after.categories?.find((c) => c.id === result.id);
      if (!category?.active) {
        setErr(
          "Essa categoria já existe e está inativa. Ative-a em Categorias de serviços para reutilizar.",
        );
        return;
      }
      if (after.settings!.revision === draft.revision + 1)
        draft.advanceRevision(draft.revision, after.settings!.revision);
      draft.set({ ...values, category_id: result.id });
      setNewCategory(false);
      setCategoryName("");
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setCategoryBusy(false);
    }
  }
  const revision = draft.revision;
  const set = (k: string, v: unknown) =>
    setValues((current) => ({ ...current, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const payload: Record<string, unknown> = { ...extra };
      for (const f of fields) {
        const v = values[f.key];
        if (f.type === "money")
          payload[f.key] =
            values.price_mode === "quote" ||
            (f.key === "price_max_cents" &&
              (values.price_mode !== "from" || !v))
              ? null
              : parseMoney(String(v ?? ""));
        else if (f.type === "number")
          payload[f.key] = v === "" || v == null ? null : Number(v);
        else if (f.type === "checkbox") payload[f.key] = Boolean(v);
        else if (f.type === "options")
          payload[f.key] =
            values.kind === "choice"
              ? String(v ?? "")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
        else
          payload[f.key] = ["category_id", "condition_field"].includes(f.key)
            ? v || null
            : String(v ?? "");
      }
      if (entity === "field") {
        const parent = data.fields.find(
          (f) => f.id === payload.condition_field,
        );
        payload.condition_value = parent
          ? parent.kind === "boolean"
            ? String(values.condition_value) === "true"
            : String(values.condition_value || "")
          : null;
      }
      if (entity === "service") {
        payload.direct_booking =
          payload.contract_mode === "immediate" &&
          payload.price_mode === "fixed" &&
          Boolean(payload.duration_minutes);
        payload.quotes_allowed = true;
        if (payload.execution_mode !== "split")
          payload.execution_max_periods = null;
        delete payload.image_media;
        if (imageChanged) payload.image_media = values.image_media || null;
      }
      if (
        payload.direct_booking &&
        (payload.price_mode !== "fixed" || !payload.duration_minutes)
      ) {
        setErr("Agendamento direto exige preço fixo e duração.");
        return;
      }
      if (
        payload.kind === "choice" &&
        new Set(payload.options as string[]).size < 2
      ) {
        setErr("Informe pelo menos duas opções diferentes.");
        return;
      }
      if (await save(entity, row?.id || null, payload, revision)) {
        draft.saved();
        onDone?.();
      }
    } catch {
      setErr("Informe um preço válido, com até duas casas decimais.");
    }
  }
  return (
    <form onSubmit={submit}>
      <DraftConflict conflict={draft.conflict} discard={draft.discard} />
      {err && (
        <p className="notice error" role="alert">
          {err}
        </p>
      )}
      <fieldset
        className="form-reset"
        disabled={!data.editable || busy || categoryBusy}
      >
        <div className="form-grid">
          {fields.map((f) => {
            if (f.key === "condition_value") {
              const parent = data.fields.find(
                (f) => f.id === values.condition_field,
              );
              if (!parent) return null;
              const choices =
                parent.kind === "boolean"
                  ? [
                      ["true", "Sim"],
                      ["false", "Não"],
                    ]
                  : ((parent.options as string[]) || []).map((v) => [v, v]);
              return (
                <label key={f.key}>
                  Resposta que mostra esta pergunta
                  <select
                    value={String(values.condition_value ?? "")}
                    onChange={(e) => set("condition_value", e.target.value)}
                    required
                  >
                    <option value="">Selecione</option>
                    {choices.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            if (f.key === "image_media")
              return (
                <div key={f.key} className="service-image-field">
                  <ImageUpload
                    org={org.id}
                    title="Imagem do serviço"
                    hint="Representa este serviço no catálogo. Fotos de trabalhos realizados ficam no portfólio."
                    value={String(values.image_media || "")}
                    legacyUrl={
                      imageChanged ? undefined : String(row?.image_url || "")
                    }
                    disabled={!data.editable || categoryBusy}
                    onBusy={setImageBusy}
                    onChange={(code) => {
                      set("image_media", code);
                      setImageChanged(true);
                    }}
                  />
                </div>
              );
            if (f.key === "category_id")
              return (
                <div key={f.key}>
                  <Field label="Categoria">
                    <select
                      value={
                        newCategory
                          ? "__create"
                          : String(values.category_id || "")
                      }
                      onChange={(e) => {
                        if (e.target.value === "__create") {
                          setNewCategory(true);
                        } else {
                          setNewCategory(false);
                          set("category_id", e.target.value);
                        }
                      }}
                    >
                      {f.options?.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                      <option value="__create">+ Criar nova categoria</option>
                    </select>
                  </Field>
                  {newCategory && (
                    <div className="inline-category">
                      <Field label="Nome da categoria">
                        <input
                          value={categoryName}
                          maxLength={120}
                          onChange={(e) => setCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void createCategory();
                            }
                          }}
                        />
                      </Field>
                      <div className="editor-actions">
                        <button
                          type="button"
                          disabled={categoryBusy || !categoryName.trim()}
                          onClick={() => void createCategory()}
                        >
                          {categoryBusy ? "Criando…" : "Criar categoria"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewCategory(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            if (f.key === "options" && values.kind !== "choice") return null;
            const v = values[f.key];
            if (f.type === "checkbox")
              return (
                <Check
                  key={f.key}
                  label={f.label}
                  checked={Boolean(v)}
                  onChange={(v) => set(f.key, v)}
                />
              );
            return (
              <Field key={f.key} label={f.label}>
                {f.type === "textarea" || f.type === "options" ? (
                  <textarea
                    rows={3}
                    maxLength={f.max || 4000}
                    required={f.required}
                    value={String(v ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : f.type === "select" ? (
                  <select
                    value={String(v ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  >
                    {f.options?.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      f.type === "number"
                        ? "number"
                        : f.type === "url"
                          ? "url"
                          : "text"
                    }
                    inputMode={f.type === "money" ? "decimal" : undefined}
                    required={
                      f.type === "money"
                        ? values.price_mode !== "quote"
                        : f.required
                    }
                    disabled={
                      f.type === "money" && values.price_mode === "quote"
                    }
                    min={f.min ?? 0}
                    max={f.type === "number" ? f.max : undefined}
                    maxLength={f.type !== "number" ? f.max || 120 : undefined}
                    step={f.type === "number" ? 1 : undefined}
                    value={String(v ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </Field>
            );
          })}
        </div>
        {data.editable && (
          <button
            className="primary"
            disabled={imageBusy || categoryBusy || newCategory}
          >
            {row ? "Salvar alterações" : "Adicionar"}
          </button>
        )}
      </fieldset>
    </form>
  );
}
const priceFields: Descriptor[] = [
  {
    key: "price_mode",
    label: "Modalidade de preço",
    type: "select",
    options: [
      ["fixed", "Preço fixo"],
      ["from", "A partir de"],
      ["quote", "Sob consulta"],
    ],
  },
  { key: "price_cents", label: "Valor em reais", type: "money" },
  {
    key: "duration_minutes",
    label: "Duração em minutos",
    type: "number",
    max: 10080,
  },
];
const serviceFields: Descriptor[] = [
  {
    key: "execution_mode",
    label: "Execução do serviço",
    type: "select",
    options: [
      ["continuous", "Execução contínua — uma única janela"],
      ["split", "Pode ser dividido em vários períodos/dias"],
    ],
  },
  {
    key: "execution_max_periods",
    label: "Máximo de períodos (opcional, de 2 a 30)",
    type: "number",
    max: 30,
  },
  {
    key: "price_max_cents",
    label:
      "Limite superior da faixa em R$ (opcional, somente para A partir de)",
    type: "money",
  },
  {
    key: "photo_policy",
    label: "Fotos para avaliação",
    type: "select",
    options: [
      ["none", "Não necessárias"],
      ["optional", "Opcionais"],
      ["recommended", "Recomendadas"],
      ["required", "Obrigatórias para avaliação"],
    ],
  },
  {
    key: "photo_instructions",
    label: "O que o cliente deve fotografar",
    type: "textarea",
    max: 1000,
  },
  { key: "name", label: "Nome do serviço", required: true, max: 120 },
  { key: "category_id", label: "Categoria", type: "select", options: [] },
  { key: "description", label: "Descrição do serviço", type: "textarea" },
  ...priceFields,
  { key: "image_media", label: "Imagem do serviço" },
  {
    key: "availability",
    label: "Disponibilidade e condições",
    type: "textarea",
    max: 2000,
  },
  { key: "notes", label: "Observações internas", type: "textarea" },
  { key: "active", label: "Serviço ativo", type: "checkbox" },
  {
    key: "quotes_allowed",
    label: "Permitir solicitação de orçamento",
    type: "checkbox",
  },
  {
    key: "contract_mode",
    label: "Forma de contratação",
    type: "select",
    options: [
      [
        "immediate",
        "Contratação imediata — quando preço e regras forem determinísticos",
      ],
      ["evaluation", "Avaliação da empresa"],
    ],
  },
];
function Catalog() {
  const { data, org, reload } = useCompany();
  const [selected, setSelected] = useState("new");
  const row = data.services.find((s) => s.id === selected);
  return (
    <>
      <Categories org={org.id} data={data.categories || []} onChange={reload} />
      <section className="card">
        <h2>Catálogo de serviços</h2>
        <p className="muted">
          “A partir de” é uma estimativa. “Sob consulta” exige avaliação.
          Valores e duração de adicionais complementam o serviço.
        </p>
        <div className="record-list">
          {data.services.map((s) => (
            <button
              className={selected === s.id ? "selected" : ""}
              key={s.id}
              onClick={() => setSelected(s.id)}
            >
              <strong>{String(s.name)}</strong>
              <span>
                {priceLabel(s)} · {s.active ? "Ativo" : "Inativo"}
              </span>
            </button>
          ))}
          {data.editable && (
            <button onClick={() => setSelected("new")}>+ Novo serviço</button>
          )}
        </div>
        {!data.services.length && <p>Nenhum serviço cadastrado.</p>}
      </section>
      {(data.editable || row) && (
        <section className="card">
          <h2>{row ? "Editar serviço" : "Novo serviço"}</h2>
          <RecordForm
            key={selected}
            entity="service"
            row={row}
            fields={serviceFields.map((f) =>
              f.key === "category_id"
                ? {
                    ...f,
                    options: [
                      ["", "Sem categoria"],
                      ...(data.categories || [])
                        .filter((c) => c.active || c.id === row?.category_id)
                        .map((c) => [
                          c.id,
                          c.name + (c.active ? "" : " (inativa)"),
                        ]),
                    ] as [string, string][],
                  }
                : f,
            )}
            defaults={{
              price_mode: "quote",
              active: true,
              quotes_allowed: true,
              direct_booking: false,
              contract_mode: "immediate",
              photo_policy: "none",
            }}
          />
        </section>
      )}
      {row && (
        <div className="company-stack">
          <ServiceRelations
            org={org.id}
            service={row}
            services={data.services}
            editable={data.editable}
            onChange={reload}
          />
          <Collection
            title="Adicionais deste serviço"
            entity="addon"
            records={data.addons.filter((a) => a.service_id === row.id)}
            fields={[
              { key: "name", label: "Nome do adicional", required: true },
              ...priceFields,
              { key: "active", label: "Adicional ativo", type: "checkbox" },
            ]}
            defaults={{
              price_mode: "quote",
              duration_minutes: 0,
              active: true,
            }}
            extra={{ service_id: row.id }}
            display={(a) => String(a.name) + " — " + priceLabel(a)}
          />
          <Collection
            title="Perguntas necessárias"
            entity="field"
            records={data.fields.filter((a) => a.service_id === row.id)}
            fields={[
              { key: "label", label: "Pergunta", required: true, max: 300 },
              { key: "instruction", label: "Instrução (opcional)", max: 500 },
              {
                key: "multiline",
                label: "Texto longo / observação",
                type: "checkbox",
              },
              {
                key: "condition_field",
                label: "Mostrar somente se (opcional)",
                type: "select",
                options: [
                  ["", "Sempre"],
                  ...data.fields
                    .filter(
                      (f) =>
                        f.service_id === row.id &&
                        f.active &&
                        !f.condition_field &&
                        ["boolean", "choice"].includes(String(f.kind)),
                    )
                    .map(
                      (f) =>
                        [String(f.id), String(f.label)] as [string, string],
                    ),
                ],
              },
              {
                key: "condition_value",
                label: "Resposta que mostra esta pergunta",
              },
              {
                key: "kind",
                label: "Tipo de resposta",
                type: "select",
                options: [
                  ["text", "Texto"],
                  ["photo", "Foto (anexo privado do serviço)"],
                  ["number", "Número"],
                  ["choice", "Escolha única"],
                  ["boolean", "Sim ou não"],
                ],
              },
              {
                key: "options",
                label: "Opções — uma por linha",
                type: "options",
              },
              {
                key: "position",
                label: "Ordem de exibição",
                type: "number",
                max: 1000,
              },
              {
                key: "required",
                label: "Resposta obrigatória",
                type: "checkbox",
              },
              { key: "active", label: "Pergunta ativa", type: "checkbox" },
            ]}
            defaults={{
              kind: "text",
              position: 0,
              required: true,
              active: true,
            }}
            extra={{ service_id: row.id }}
            display={(a) =>
              String(a.label) + (a.required ? " · Obrigatória" : " · Opcional")
            }
          />
        </div>
      )}
    </>
  );
}
function Collection({
  title,
  entity,
  records,
  fields,
  defaults,
  extra,
  display,
}: {
  title: string;
  entity: string;
  records: Row[];
  fields: Descriptor[];
  defaults?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  display: (r: Row) => string;
}) {
  const { data } = useCompany();
  const [selected, setSelected] = useState("new");
  const row = records.find((r) => r.id === selected);
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="record-list">
        {records.map((r) => (
          <button
            key={r.id}
            className={r.id === selected ? "selected" : ""}
            onClick={() => setSelected(r.id)}
          >
            {display(r)}
            {r.active === false ? " · Inativo" : ""}
          </button>
        ))}
        {data.editable && (
          <button onClick={() => setSelected("new")}>+ Novo registro</button>
        )}
      </div>
      {!records.length && <p className="muted">Nenhum registro cadastrado.</p>}
      {(data.editable || row) && (
        <RecordForm
          key={entity + selected + String(extra?.service_id || "")}
          entity={entity}
          row={row}
          fields={fields}
          defaults={defaults}
          extra={extra}
        />
      )}
    </section>
  );
}
function FaqEditor() {
  const { data, org } = useCompany();
  const current = data.manuals.find(
    (m) => m.id === data.settings!.published_manual_id,
  );
  return (
    <>
      <p className="notice">
        A FAQ pública usa as perguntas da última versão publicada do manual.
        Salvar um rascunho não altera essa versão.
      </p>
      <Link to={"/empresa/" + org.slug + "/faq"}>Consultar FAQ pública</Link>
      {data.editable ? (
        <Collection
          title="Perguntas frequentes"
          entity="faq"
          records={data.faqs}
          fields={[
            {
              key: "question",
              label: "Pergunta da FAQ",
              required: true,
              max: 300,
            },
            {
              key: "answer",
              label: "Resposta pública",
              type: "textarea",
              required: true,
            },
            {
              key: "position",
              label: "Ordem de exibição",
              type: "number",
              max: 1000,
            },
            {
              key: "active",
              label: "Incluir na próxima publicação",
              type: "checkbox",
            },
          ]}
          defaults={{ position: 0, active: true }}
          display={(r) => String(r.question)}
        />
      ) : (
        <section className="card">
          <h2>FAQ aprovada</h2>
          {current?.snapshot?.faqs.map((f, i) => (
            <article key={i}>
              <h3>{f.question}</h3>
              <p className="preserve-text">{f.answer}</p>
            </article>
          )) || <p>Nenhuma FAQ aprovada.</p>}
        </section>
      )}
    </>
  );
}
function Replies() {
  const { data } = useCompany();
  const current = data.manuals.find(
    (m) => m.id === data.settings!.published_manual_id,
  );
  return data.editable ? (
    <Collection
      title="Respostas rápidas"
      entity="reply"
      records={data.replies}
      fields={[
        { key: "title", label: "Título da resposta", required: true },
        {
          key: "body",
          label: "Texto aprovado para resposta",
          type: "textarea",
          required: true,
        },
        {
          key: "active",
          label: "Incluir na próxima publicação",
          type: "checkbox",
        },
      ]}
      defaults={{ active: true }}
      display={(r) => String(r.title)}
    />
  ) : (
    <section className="card">
      <h2>Respostas aprovadas</h2>
      {current?.snapshot?.quick_replies.map((r, i) => (
        <article key={i}>
          <h3>{r.title}</h3>
          <p className="preserve-text">{r.body}</p>
        </article>
      )) || <p>Nenhuma resposta publicada.</p>}
    </section>
  );
}
function Rules() {
  const { data } = useCompany();
  return (
    <section className="card">
      <h2>Regras empresariais</h2>
      <p className="muted">
        Descreva condições objetivas. Para a Equipe SYZIA compartilhada, revise
        as orientações publicadas antes de reativar esse apoio.
      </p>
      <SingletonForm
        key="rules"
        entity="rules"
        record={data.rules!}
        labels={ruleLabels}
      />
    </section>
  );
}
function SingletonForm({
  entity,
  record,
  labels,
}: {
  entity: string;
  record: Row;
  labels: Record<string, string>;
}) {
  const { data, busy, save } = useCompany();
  const draft = useDraft(record, data.settings!.revision);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await save(
            entity,
            null,
            Object.fromEntries(Object.keys(labels).map((k) => [k, f.get(k)])),
            draft.revision,
          )
        )
          draft.saved();
      }}
    >
      <DraftConflict conflict={draft.conflict} discard={draft.discard} />
      <fieldset className="form-reset" disabled={!data.editable || busy}>
        {Object.entries(labels).map(([k, l]) => (
          <Field key={k} label={l}>
            <textarea
              name={k}
              rows={3}
              maxLength={4000}
              value={String(draft.value[k] || "")}
              onChange={(e) =>
                draft.set({ ...draft.value, [k]: e.target.value })
              }
            />
          </Field>
        ))}
        {data.editable && <button className="primary">Salvar regras</button>}
      </fieldset>
    </form>
  );
}
function Permissions() {
  const { data } = useCompany();
  return <PermissionsForm />;
}
function PermissionsForm() {
  const { data, busy, save } = useCompany();
  const draft = useDraft(data.permissions!, data.settings!.revision);
  const p = draft.value,
    allowed = p.allowed_actions as string[],
    never = Boolean(p.never_change_price),
    discount = Number(p.max_discount_percent),
    reviewed = Boolean(p.reviewed);
  const setAllowed = (v: string[]) => draft.set({ ...p, allowed_actions: v });
  const setNever = (v: boolean) => draft.set({ ...p, never_change_price: v });
  const setDiscount = (v: number) =>
    draft.set({ ...p, max_discount_percent: v });
  const setReviewed = (v: boolean) => draft.set({ ...p, reviewed: v });
  const [err, setErr] = useState("");
  const contradictory = never && (allowed.includes("discount") || discount > 0);
  return (
    <section className="card">
      <h2>Autonomia da equipe de atendimento</h2>
      <p>
        Este é o teto da empresa. Cada pessoa também precisa das permissões
        individuais, do vínculo ativo e das capacidades do plano. Para sua equipe
        própria, os limites salvos valem sem publicação do Manual. A Equipe SYZIA
        compartilhada também depende das orientações publicadas; revogações valem imediatamente.
      </p>
      <p>
        Faixas precisam de limite superior cadastrado e publicado. Condições são
        somente as publicadas; encaixes respeitam a capacidade. A equipe
        compartilhada não define preços variáveis nem itens manuais.
      </p>
      <p className="muted">
        Somente ações concedidas ficam autorizadas. Novas permissões da Equipe
        SYZIA compartilhada exigem uma nova publicação do Manual e revisão de prontidão.
      </p>
      <DraftConflict conflict={draft.conflict} discard={draft.discard} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          if (contradictory) {
            setErr(
              "“Nunca alterar preço” não permite desconto. Revise as escolhas.",
            );
            return;
          }
          if (
            (allowed.includes("discount") && discount <= 0) ||
            (!allowed.includes("discount") && discount !== 0)
          ) {
            setErr(
              "Defina um limite positivo somente quando permitir desconto.",
            );
            return;
          }
          if (
            await save(
              "permissions",
              null,
              {
                allowed_actions: allowed,
                never_change_price: never,
                max_discount_percent: discount,
                reviewed,
              },
              draft.revision,
            )
          )
            draft.saved();
        }}
      >
        <fieldset className="form-reset" disabled={!data.editable || busy}>
          <Check
            label="Nunca alterar preço"
            checked={never}
            onChange={setNever}
          />
          <div className="permission-grid">
            {Object.entries(actionLabels).map(([k, label]) => (
              <Check
                key={k}
                label={label}
                checked={allowed.includes(k)}
                onChange={(v) =>
                  setAllowed(
                    v ? [...allowed, k] : allowed.filter((x) => x !== k),
                  )
                }
              />
            ))}
          </div>
          <Field label="Desconto máximo (%)">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              required
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </Field>
          <Check
            label="Revisei e aprovo estas permissões"
            checked={reviewed}
            onChange={setReviewed}
          />
          {(err || contradictory) && (
            <p className="notice error" role="alert">
              {err ||
                "Há uma contradição: nunca alterar preço está combinado com desconto."}
            </p>
          )}
          {data.editable && (
            <button className="primary">Salvar autonomia</button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
function ManualEditor() {
  const { data, busy, act } = useCompany();
  const [selected, setSelected] = useState(""),
    [confirm, setConfirm] = useState(false);
  const m = data.manuals.find((m) => m.id === selected) || data.manuals[0];
  const draft = data.manuals.find((m) => m.status === "draft");
  return (
    <>
      <section className="card">
        <h2>Manual da empresa — Opcional</h2>
        <p>Organize informações e orientações para sua equipe consultar quando necessário.</p>
        <p className="muted">
          Versões publicadas são preservadas. Crie uma revisão para atualizar
          orientações. O Manual não impede a operação da equipe própria. Para
          habilitar o suporte compartilhado SYZIA, publique as orientações necessárias.
        </p>
        <div className="record-list">
          {data.manuals.map((v) => (
            <button
              key={v.id}
              className={m?.id === v.id ? "selected" : ""}
              onClick={() => {
                setSelected(v.id);
                setConfirm(false);
              }}
            >
              Versão {v.version} ·{" "}
              {v.status === "draft" ? "Rascunho" : "Publicada"}
              <span>{v.title}</span>
            </button>
          ))}
        </div>
        {data.editable && !draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act("company_create_manual", {
                p_expected_revision: data.settings!.revision,
                p_title: f.get("title"),
              }).then((ok) => {
                if (ok) setSelected("");
              });
            }}
          >
            <Field label="Título da nova versão">
              <input
                name="title"
                minLength={2}
                maxLength={160}
                required
                placeholder="Manual de atendimento — revisão"
              />
            </Field>
            <button className="primary" disabled={busy}>
              Criar rascunho
            </button>
          </form>
        )}
        {!data.manuals.length && <p>Nenhum manual cadastrado.</p>}
      </section>
      {m && (
        <>
          <section className="card">
            <h2>
              {m.title} · versão {m.version}
            </h2>
            {m.status === "published" ? (
              <>
                <p className="notice">
                  Versão publicada em{" "}
                  {new Date(m.published_at!).toLocaleString("pt-BR")}. O
                  conteúdo desta versão é imutável.
                </p>
                <PublishedSnapshot manual={m} />
              </>
            ) : (
              <p className="notice">
                Complete todos os tópicos com pelo menos 10 caracteres úteis,
                configure os demais itens e revise antes de publicar.
              </p>
            )}
            {data.sections
              .filter((s) => s.manual_id === m.id)
              .map((s) => (
                <details className="manual-topic" key={s.id}>
                  <summary>
                    {sections[String(s.section_key)]}
                    {String(s.content).trim().length < 10 ? " · Pendente" : ""}
                  </summary>
                  {m.status === "draft" && data.editable ? (
                    <RecordForm
                      key={s.id}
                      entity="section"
                      row={s}
                      fields={[
                        {
                          key: "content",
                          label: sections[String(s.section_key)],
                          type: "textarea",
                          max: 12000,
                        },
                      ]}
                    />
                  ) : (
                    <p className="preserve-text">{String(s.content)}</p>
                  )}
                </details>
              ))}
            {m.status === "draft" && data.editable && (
              <div className="publish-controls">
                <Check
                  label="Revisei o manual e o conteúdo da FAQ pública desta versão"
                  checked={confirm}
                  onChange={setConfirm}
                />
                <button
                  className="primary"
                  disabled={busy || !confirm}
                  onClick={() =>
                    void act("company_publish_manual", {
                      p_manual: m.id,
                      p_expected_revision: data.settings!.revision,
                    }).then((ok) => {
                      if (ok) setConfirm(false);
                    })
                  }
                >
                  Publicar versão do manual
                </button>
                <button
                  disabled={busy || !confirm}
                  onClick={() =>
                    void act("company_discard_manual", {
                      p_manual: m.id,
                      p_expected_revision: data.settings!.revision,
                    }).then((ok) => {
                      if (ok) {
                        setSelected("");
                        setConfirm(false);
                      }
                    })
                  }
                >
                  Descartar rascunho
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
function PublishedSnapshot({ manual }: { manual: Manual }) {
  const snap = manual.snapshot;
  if (!snap) return null;
  return (
    <details className="manual-topic">
      <summary>Serviços, regras e respostas desta publicação</summary>
      <h3>Serviços e preços</h3>
      {snap.services.map((s) => (
        <p key={s.id}>
          {String(s.name)} · {priceLabel(s)}
        </p>
      ))}
      <h3>Adicionais</h3>
      {snap.addons.map((a) => (
        <p key={a.id}>
          {String(a.name)} · {priceLabel(a)} · {String(a.duration_minutes)} min
          adicionais
        </p>
      ))}
      <h3>Perguntas por serviço</h3>
      {snap.fields.map((f) => (
        <p key={f.id}>
          {String(
            snap.services.find((s) => s.id === f.service_id)?.name || "Serviço",
          )}{" "}
          — {String(f.label)} {f.required ? "(obrigatória)" : ""}
          {Array.isArray(f.options) && f.options.length
            ? " · " + f.options.join(" / ")
            : ""}
        </p>
      ))}
      <h3>Funcionamento e contato interno</h3>
      {Object.entries({
        description: "Negócio",
        service_regions: "Regiões",
        payment_methods: "Pagamentos",
        exception_contact_name: "Responsável por exceções",
        exception_contact: "Contato interno",
      }).map(([k, l]) => (
        <p key={k}>
          <strong>{l}:</strong> {String(snap.settings[k] || "")}
        </p>
      ))}
      {["business_hours", "human_hours"].map((k) => (
        <p key={k}>
          <strong>
            {k === "business_hours"
              ? "Horários da empresa"
              : "Horários da equipe"}
            :
          </strong>{" "}
          {(snap.settings[k] as Hours)
            .map(
              (h) =>
                ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][h.day] +
                " " +
                h.open +
                "–" +
                h.close,
            )
            .join("; ")}{" "}
          (Recife)
        </p>
      ))}
      <h3>Regras</h3>
      {Object.entries(ruleLabels).map(([k, l]) => (
        <div key={k}>
          <strong>{l}</strong>
          <p className="preserve-text">{String(snap.rules[k] || "")}</p>
        </div>
      ))}
      <h3>Autonomia aprovada</h3>
      <p>
        {(snap.permissions.allowed_actions as string[])
          .map((k) => actionLabels[k])
          .join(", ") || "Nenhuma ação concedida."}
      </p>
      <p>Desconto máximo: {String(snap.permissions.max_discount_percent)}%</p>
      <h3>FAQ pública</h3>
      {snap.faqs.map((f, i) => (
        <p key={i}>
          <strong>{f.question}</strong>
          <br />
          {f.answer}
        </p>
      ))}
      <h3>Respostas rápidas</h3>
      {snap.quick_replies.map((r, i) => (
        <p key={i}>
          <strong>{r.title}</strong>
          <br />
          {r.body}
        </p>
      ))}
    </details>
  );
}
function Readiness() {
  const { data, busy, act, org } = useCompany();
  const c = data.settings!,
    shared = c.support_configured && c.support_mode !== "own",
    ready = Object.values(data.checklist).every(Boolean);
  return (
    <>
      <Progress />
      <section className="card">
        <h2>{shared ? "Prontidão do suporte compartilhado SYZIA" : "Configuração da equipe própria"}</h2>
        <p>O Manual é opcional para a equipe própria. As exigências de orientação publicada se aplicam somente à atuação da Equipe SYZIA compartilhada.</p>
        <p className={ready ? "notice" : "notice error"}>
          {ready
            ? "A empresa atende aos requisitos de configuração."
            : shared ? "O suporte compartilhado ainda precisa de configuração. Sua empresa pode continuar operando com a própria equipe." : "Revise os dados mínimos, serviços e horários da empresa."}
        </p>
        <ul className="checklist">
          {Object.entries(data.checklist).map(([key, ok]) => {
            const [label, path] = checklistLabels[key] || [key, "configuracao"];
            return (
              <li key={key}>
                <span className={"check-icon " + (ok ? "done" : "pending")}>
                  {ok ? "✓" : "○"}
                </span>
                <Link
                  to={
                    "/painel/" + org.id + (path === "acessos" ? "" : "/" + path)
                  }
                >
                  {label}
                </Link>
                <span className="muted">{ok ? "Concluído" : "Pendente"}</span>
              </li>
            );
          })}
        </ul>
        <p>
          <strong>Atendimento humano:</strong>{" "}
          {c.human_enabled && ready ? "Habilitado" : "Desabilitado"}
        </p>
        <p>
          <strong>FAQ pública:</strong>{" "}
          {c.faq_public_enabled ? "Habilitada" : "Desabilitada"}
        </p>
        {data.editable && (
          <div className="action-row">
            <button
              disabled={busy || (!c.human_enabled && !ready)}
              onClick={() =>
                void act("company_set_activation", {
                  p_expected_revision: c.revision,
                  p_human: !c.human_enabled,
                  p_public_faq: c.faq_public_enabled,
                })
              }
            >
              {c.human_enabled
                ? "Desabilitar atendimento humano"
                : "Habilitar atendimento humano"}
            </button>
            <button
              disabled={busy || !c.published_manual_id}
              onClick={() =>
                void act("company_set_activation", {
                  p_expected_revision: c.revision,
                  p_human: c.human_enabled && ready,
                  p_public_faq: !c.faq_public_enabled,
                })
              }
            >
              {c.faq_public_enabled
                ? "Retirar FAQ pública"
                : "Habilitar FAQ pública"}
            </button>
          </div>
        )}
        <p className="muted">
          A FAQ pode permanecer disponível sem equipe vinculada. O atendimento
          compartilhado exige todos os itens acima; o servidor verifica os requisitos
          novamente ao salvar.
        </p>
      </section>
    </>
  );
}
export function PublicFaq() {
  const { slug } = useParams();
  const [data, setData] = useState<{
      name: string;
      faqs: { question: string; answer: string }[];
    } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const n = ++version.current;
      try {
        const r = await rpc<typeof data>("company_public_faq", {
          p_slug: slug,
        });
        if (active && n === version.current) {
          setData(r);
          setError(false);
        }
      } catch {
        if (active && n === version.current) {
          setData(null);
          setError(true);
        }
      } finally {
        if (active && n === version.current) setLoading(false);
      }
    }
    setLoading(true);
    setData(null);
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      version.current++;
      clearInterval(id);
    };
  }, [slug]);
  return (
    <main className="faq-public">
      <p className="eyebrow">PERGUNTAS FREQUENTES</p>
      {loading ? (
        <p role="status">Carregando FAQ…</p>
      ) : data ? (
        <>
          <h1>{data.name}</h1>
          <p className="muted">Informações aprovadas pela empresa.</p>
          {data.faqs.map((f, i) => (
            <details className="card" key={i}>
              <summary>{f.question}</summary>
              <p className="preserve-text">{f.answer}</p>
            </details>
          ))}
        </>
      ) : (
        <>
          <h1>FAQ indisponível</h1>
          <p role={error ? "alert" : undefined}>
            {error
              ? "Não foi possível carregar. Tente novamente em instantes."
              : "A empresa não disponibilizou esta FAQ ou está indisponível."}
          </p>
        </>
      )}
    </main>
  );
}
