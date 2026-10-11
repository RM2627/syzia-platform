import { AttendanceBadge, BookingExtras, RequestContact, UnreadSummary } from "./BookingExtras";
import { DocumentButton } from "../documents/DocumentButton";
import { ExecutionBooking } from "./ExecutionBooking";
import { duration, Periods } from "../scheduling/ExecutionSchedule";
import { QuoteCalculator } from "./QuoteCalculator";
import { QuoteSummary } from "../consumer/QuoteSummary";
import { RequestedItems, OrderPrices } from "../consumer/RequestedItems";
import { usePermissions } from "../permissions/Permissions";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { rpc, errorMessage } from "../api";
import { Dialog } from "../ui/Dialog";
import "./operations.css";
type Data = Record<string, any>;
const label: Record<string, string> = {
  scheduled: "Confirmado",
  confirmed: "Confirmado",
  in_progress: "Em execução",
  completed: "Concluído",
  cancelled: "Cancelado",
  booked: "Agendado",
  blocked: "Bloqueio",
  rescheduled: "Reagendado",
  started: "Iniciado",
  submitted: "Solicitado",
  under_review: "Em análise",
  quoted: "Proposta enviada",
  approved: "Aprovado",
  declined: "Recusado",
  draft: "Rascunho",
};
const money = (v: number | null) =>
  v == null
    ? "Sob consulta"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(v / 100);
const date = (
  v: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "short",
  },
) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    ...options,
  }).format(new Date(v));
const dayOf = (v: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(v));
const occurs = (a: Data, d: string) =>
  Date.parse(a.starts_at) < Date.parse(localTime(add(d, 1), "00:00")) &&
  Date.parse(a.ends_at) > Date.parse(localTime(d, "00:00"));
const today = () => dayOf(new Date().toISOString());
const add = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const localTime = (day: string, time: string) =>
  new Date(day + "T" + time + ":00-03:00").toISOString();
function homeError(e: any) {
  if (e?.code === "42501" || /denied|permission/.test(e?.message || ""))
    return "Seu acesso a este bloco não está autorizado. Revise as permissões desta empresa.";
  if (e instanceof TypeError || /fetch|network|offline/i.test(e?.message || ""))
    return "Não foi possível conectar. Confira a conexão e tente novamente.";
  return "Este bloco não pôde ser carregado. Tente novamente; se persistir, informe o responsável pela plataforma.";
}
function useData(name: string, args: Data) {
  const key = JSON.stringify(args),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    gen = useRef(0);
  const reload = useCallback(async () => {
    const g = ++gen.current;
    setLoading(true);
    try {
      const x = await rpc(name, JSON.parse(key));
      if (g === gen.current) {
        setData(x);
        setError("");
      }
    } catch (e) {
      if (g === gen.current) {
        setData(null);
        setError(
          name === "operations_home_section" ? homeError(e) : errorMessage(e),
        );
      }
    } finally {
      if (g === gen.current) setLoading(false);
    }
  }, [name, key]);
  useEffect(() => {
    setData(null);
    void reload();
    return () => {
      gen.current++;
    };
  }, [reload]);
  return { data, error, loading, reload };
}
function Loading({ s }: { s: ReturnType<typeof useData> }) {
  return s.error ? (
    <div role="alert" className="notice error">
      {s.error}{" "}
      <button onClick={() => void s.reload()}>Tentar novamente</button>
    </div>
  ) : (
    <p role="status">Carregando sua empresa…</p>
  );
}
function Appointment({ a, base }: { a: Data; base: string }) {
  const state = a.state === "cancelled" ? "cancelled" : a.execution_state;
  return (
    <Link
      className={"op-appointment " + (a.kind === "block" ? "is-block" : "")}
      to={base + "/agenda?ficha=" + a.id}
    >
      <time>{date(a.starts_at, { hour: "2-digit", minute: "2-digit" })}</time>
      <div>
        <strong>
          {a.kind === "block" ? a.note || "Período bloqueado" : a.customer}
        </strong>
        <p>{a.kind === "block" ? "Indisponível para reservas" : a.service}</p><AttendanceBadge attendance={a.attendance}/>
        <small>
          Até{" "}
          {date(
            a.service_minutes
              ? new Date(
                  Date.parse(a.starts_at) + a.service_minutes * 60000,
                ).toISOString()
              : a.ends_at,
            { hour: "2-digit", minute: "2-digit" },
          )}
          {` · ${duration(a.service_minutes || Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000))}${a.service_minutes ? "" : " reservada"}`}
          {a.execution_group ? ` · Parte ${a.part_number} do atendimento` : ""}
        </small>
      </div>
      <span className={"op-status " + state}>
        {a.kind === "block" && state !== "cancelled"
          ? "Bloqueado"
          : label[state]}
      </span>
    </Link>
  );
}
export function Operations({
  org,
  section = "",
}: {
  org: string;
  section?: string;
}) {
  const [params] = useSearchParams();
  if (section === "agenda" && params.has("ficha"))
    return <Detail org={org} id={params.get("ficha")!} />;
  if (section === "novo-agendamento" || section === "novo-orcamento")
    return <NewRequest org={org} booking={section === "novo-agendamento"} />;
  if (section === "clientes") return <Customers org={org} />;
  if (section === "orcamentos") return <Quotes org={org} />;
  if (section === "agenda") return <Agenda org={org} />;
  return <Daily org={org} />;
}
function HomeBlock({
  s,
  children,
}: {
  s: ReturnType<typeof useData>;
  children: React.ReactNode;
}) {
  return s.data ? <>{children}</> : <Loading s={s} />;
}
function Daily({ org }: { org: string }) {
  const { can, data: permissionData } = usePermissions();
  const edit = (action: string) =>
    can(action) &&
    !["own_attendant", "shared_attendant"].includes(permissionData?.role || "");
  const header = useData("operations_home_section", {
      p_org: org,
      p_section: "header",
    }),
    agenda = useData("operations_home_section", {
      p_org: org,
      p_section: "agenda",
    }),
    attention = useData("operations_home_section", {
      p_org: org,
      p_section: "attention",
    }),
    updates = useData("operations_home_section", {
      p_org: org,
      p_section: "updates",
    });
  const [showAll, setShowAll] = useState(false);
  const priority = (x: Data) =>
    x.reason.includes("Decisão")
      ? 0
      : x.reason.includes("falta agendar")
        ? 1
        : x.reason.includes("Retorno")
          ? 2
          : x.reason.includes("aguardando atendimento")
            ? 3
            : 4;
  const tasks = [...(attention.data?.items || [])].sort(
    (a, b) => priority(a) - priority(b),
  );
  const base = "/painel/" + org,
    d = agenda.data,
    appointments: Data[] = d?.appointments || [],
    aToday = appointments.filter(
      (a) => occurs(a, d.today) && a.state !== "cancelled",
    ),
    tomorrow = appointments.filter(
      (a) => dayOf(a.starts_at) === add(d.today, 1) && a.state !== "cancelled",
    );
  return (
    <>
      <header className="op-head">
        <div>
          <span className="eyebrow">
            {header.data?.company || "Sua empresa"}
          </span>
          <h1>O que fazer hoje?</h1>
          <HomeBlock s={header}>
            <p>
              {header.data &&
                date(header.data.today + "T12:00Z", { dateStyle: "full" })}
            </p>
          </HomeBlock>
        </div>
      </header>
      {can("central.read") && <UnreadSummary org={org}/>}
      <div className="op-quick">
        {edit("agenda.manage") && (
          <Link className="primary" to={base + "/novo-agendamento"}>
            + Novo agendamento
          </Link>
        )}
        {edit("clients.manage") && (
          <Link className="button" to={base + "/clientes?novo=1"}>
            + Novo cliente
          </Link>
        )}
        {edit("quotes.manage") && can("quotes.values") && (
          <Link className="button" to={base + "/novo-orcamento"}>
            + Novo orçamento
          </Link>
        )}
      </div>
      <div className="op-grid">
        <div>
          <section className="card" aria-label="Agenda de hoje">
            <h2>Agenda de hoje</h2>
            <HomeBlock s={agenda}>
              {d?.available === false ? (
                <p>Agenda não disponível para este acesso.</p>
              ) : (
                <>
                  <p>
                    {aToday.filter((a) => a.kind === "booking").length}{" "}
                    agendamentos ·{" "}
                    {
                      aToday.filter((a) => a.execution_state === "in_progress")
                        .length
                    }{" "}
                    em execução
                  </p>
                  {d?.next && (
                    <section className="op-next">
                      <span>PRÓXIMO ATENDIMENTO</span>
                      <h3>
                        {date(d.next.starts_at)} · {d.next.customer}
                      </h3>
                      <p>{d.next.service}</p>
                      <Link to={base + "/agenda?ficha=" + d.next.id}>
                        Abrir ficha do serviço →
                      </Link>
                    </section>
                  )}
                  <div className="op-day-list">
                    {aToday.map((a) => (
                      <Appointment key={a.id} a={a} base={base} />
                    ))}
                    {!aToday.length && (
                      <p className="op-empty">
                        Nenhum atendimento agendado para hoje.
                      </p>
                    )}
                  </div>
                  <Link to={base + "/agenda"}>Abrir Agenda completa →</Link>
                  <h2>Amanhã</h2>
                  {tomorrow.map((a) => (
                    <Appointment key={a.id} a={a} base={base} />
                  ))}
                  {!tomorrow.length && (
                    <p className="op-empty">Nenhum compromisso para amanhã.</p>
                  )}
                </>
              )}
            </HomeBlock>
          </section>
        </div>
        <div>
          <section className="card" aria-label="Precisa da sua atenção">
            <h2>Precisa da sua atenção</h2>
            <HomeBlock s={attention}>
              {tasks.slice(0, showAll ? tasks.length : 8).map((x: Data) => (
                <Link key={x.id} className="op-attention" to={x.href}>
                  <strong>
                    {x.customer} · {x.reason}
                  </strong>
                  <p>{x.detail}</p>
                  <span>{x.action} →</span>
                </Link>
              ))}
              {tasks.length > 8 && (
                <button onClick={() => setShowAll(!showAll)}>
                  {showAll
                    ? "Mostrar menos"
                    : `Ver todas as ${tasks.length} tarefas`}
                </button>
              )}
              {attention.data?.items.length === 0 && (
                <p className="op-empty">
                  Nenhuma tarefa aguardando sua ação neste momento.
                </p>
              )}
            </HomeBlock>
          </section>
          <section
            className="card op-notifications"
            aria-label="Últimas atualizações"
          >
            <h2>Últimas atualizações</h2>
            <HomeBlock s={updates}>
              {updates.data?.notifications.map((n: Data) => (
                <Link className="op-attention" to={n.href} key={n.id}>
                  <strong>
                    {n.title}
                    {!n.read ? " •" : ""}
                  </strong>
                  <p>{date(n.created_at)}</p>
                </Link>
              ))}
              {updates.data?.notifications.length === 0 && (
                <p>Novos horários e decisões aparecerão aqui.</p>
              )}
            </HomeBlock>
          </section>
        </div>
      </div>
    </>
  );
}
function Agenda({ org }: { org: string }) {
  const { can, data: permissionData } = usePermissions();
  const edit = (action: string) =>
    can(action) &&
    !["own_attendant", "shared_attendant"].includes(permissionData?.role || "");
  const [day, setDay] = useState(today()),
    [view, setView] = useState("day"),
    [block, setBlock] = useState(false),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    base = "/painel/" + org;
  const first = view === "month" ? day.slice(0, 8) + "01" : day,
    last =
      view === "month" ? add(first, 31) : view === "week" ? add(day, 6) : day,
    s = useData("operations_agenda", { p_org: org, p_from: first, p_to: last });
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const f = new FormData(e.currentTarget);
    try {
      await rpc("consumer_schedule_block", {
        p_org: org,
        p_start: localTime(String(f.get("day")), String(f.get("start"))),
        p_end: localTime(String(f.get("day")), String(f.get("end"))),
        p_note: f.get("note"),
        p_key: crypto.randomUUID(),
      });
      setBlock(false);
      await s.reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="op-head">
        <div>
          <span className="eyebrow">SUA ROTINA, ORGANIZADA</span>
          <h1>Agenda</h1>
          <p>
            Horários de Recife. Reservas e bloqueios compartilham a mesma
            disponibilidade.
          </p>
        </div>
        {edit("agenda.manage") && (
          <Link className="primary" to={base + "/novo-agendamento"}>
            + Novo agendamento
          </Link>
        )}
      </header>
      <div className="op-toolbar">
        <button
          onClick={() => {
            setDay(today());
            setView("day");
          }}
        >
          Hoje
        </button>
        {[
          ["day", "Dia"],
          ["week", "Semana"],
          ["month", "Calendário"],
        ].map(([v, l]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {l}
          </button>
        ))}
        <label>
          Data
          <input
            aria-label="Data da agenda"
            type="date"
            required
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        </label>
        {edit("agenda.manage") && (
          <button onClick={() => setBlock(true)}>Bloquear período</button>
        )}
        <Link
          hidden={!can("page.read") || !edit("agenda.manage")}
          to={base + "/consumidor#disponibilidade"}
        >
          Configurar disponibilidade
        </Link>
      </div>
      {!s.data ? (
        <Loading s={s} />
      ) : view === "month" ? (
        <div className="op-calendar">
          {Array.from(
            {
              length: new Date(
                Number(day.slice(0, 4)),
                Number(day.slice(5, 7)),
                0,
              ).getDate(),
            },
            (_, i) => add(first, i),
          ).map((d) => (
            <article key={d} className="op-calendar-day">
              <strong>{d.slice(8)}</strong>
              {s.data.appointments
                .filter((a: Data) => occurs(a, d))
                .map((a: Data) => (
                  <Link key={a.id} to={base + "/agenda?ficha=" + a.id}>
                    {date(a.starts_at, { hour: "2-digit", minute: "2-digit" })}{" "}
                    · {a.kind === "block" ? "Bloqueado" : a.customer} ·{" "}
                    {
                      label[
                        a.state === "cancelled"
                          ? "cancelled"
                          : a.execution_state
                      ]
                    }
                  </Link>
                ))}
            </article>
          ))}
        </div>
      ) : (
        <>
          {Array.from({ length: view === "week" ? 7 : 1 }, (_, i) =>
            add(day, i),
          ).map((d) => (
            <section key={d} className="card">
              <h2 className="op-day-label">
                {date(d + "T12:00Z", { dateStyle: "full" })}
              </h2>
              <div className="op-day-list">
                {s.data.appointments
                  .filter((a: Data) => occurs(a, d))
                  .map((a: Data) => (
                    <Appointment key={a.id} a={a} base={base} />
                  ))}
                {!s.data.appointments.some((a: Data) => occurs(a, d)) && (
                  <p className="op-empty">
                    Nenhum compromisso registrado. A disponibilidade para novos
                    horários será validada ao agendar.
                  </p>
                )}
              </div>
            </section>
          ))}
        </>
      )}
      {block && edit("agenda.manage") && (
        <Dialog title="Bloquear período" close={() => !busy && setBlock(false)}>
          <form className="op-form" onSubmit={save}>
            <p>
              O período fica indisponível para novos agendamentos. Reservas
              existentes não serão removidas.
            </p>
            <label>
              Dia
              <input type="date" name="day" defaultValue={day} required />
            </label>
            <label>
              Início
              <input type="time" name="start" required defaultValue="12:00" />
            </label>
            <label>
              Fim
              <input type="time" name="end" required defaultValue="14:00" />
            </label>
            <label>
              Motivo
              <input
                name="note"
                maxLength={1000}
                required
                placeholder="Ex.: compromisso"
              />
            </label>
            {err && <p role="alert">{err}</p>}
            <button className="primary" disabled={busy}>
              Confirmar bloqueio
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
function Detail({ org, id }: { org: string; id: string }) {
  const { can, data: permissionData } = usePermissions();
  const edit = (action: string) =>
    can(action) &&
    !["own_attendant", "shared_attendant"].includes(permissionData?.role || "");
  const s = useData("operations_detail", { p_org: org, p_id: id }),
    [action, setAction] = useState(""),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [notice, setNotice] = useState(""),
    base = "/painel/" + org;
  async function apply(data: Data = {}) {
    if (!s.data) return;
    setBusy(true);
    setErr("");
    try {
      await rpc("operations_appointment_act", {
        p_org: org,
        p_id: id,
        p_revision: s.data.appointment.revision,
        p_action: action,
        p_data: data,
        p_key: crypto.randomUUID(),
      });
      setAction("");
      setNotice("Alteração registrada no histórico.");
      await s.reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!s.data) return <Loading s={s} />;
  const d = s.data,
    a = d.appointment,
    state = a.state === "cancelled" ? "cancelled" : a.execution_state;
  return (
    <>
      <Link to={base + "/agenda"}>← Agenda</Link>
      <header className="op-head">
        <div>
          <span className="eyebrow">FICHA DO SERVIÇO</span>
          <h1>{a.kind === "block" ? "Período bloqueado" : d.customer?.name}</h1>
          <p>
            {date(a.starts_at)} —{" "}
            {date(a.ends_at, { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <span className={"op-status " + state}>{label[state]}</span>
      </header>
      {a.kind === "booking" && <>{can("quotes.read") && <RequestContact key={d.request?.public_code} org={org} request={d.request.public_code}/>}<BookingExtras key={id} org={org} id={id} detail={d}/></>}
      {notice && (
        <p role="status" className="op-result">
          {notice}
        </p>
      )}
      {a.kind === "booking" && (
        <section className="card">
          <h2>Responsável por este período</h2>
          <p>
            {d.responsibles?.find((m: Data) => m.id === a.responsible_id)
              ?.name || "Sem responsável individual"}
          </p>
          {edit("agenda.manage") &&
            a.state === "confirmed" &&
            a.execution_state === "scheduled" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setErr("");
                  try {
                    await rpc("operations_assign_responsible", {
                      p_org: org,
                      p_id: id,
                      p_user: f.get("responsible") || null,
                      p_revision: a.revision,
                      p_key: crypto.randomUUID(),
                    });
                    setNotice(
                      "Responsável atualizado. Disponibilidade validada para o período completo.",
                    );
                    await s.reload();
                  } catch (e) {
                    setErr(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Funcionário responsável
                  <select
                    name="responsible"
                    key={String(a.revision)}
                    defaultValue={a.responsible_id || ""}
                    disabled={busy}
                  >
                    <option value="">Sem responsável individual</option>
                    {d.responsibles?.map((m: Data) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={busy}>Salvar responsável</button>
              </form>
            )}
        </section>
      )}
      {d.periods?.length > 1 && (
        <section className="card">
          <h2>Períodos deste atendimento</h2>
          <Periods
            periods={d.periods.map((x: any) => ({
              start: x.starts_at,
              end: new Date(
                Date.parse(x.starts_at) + x.service_minutes * 60000,
              ).toISOString(),
              minutes: x.service_minutes,
              reserved_until: x.ends_at,
            }))}
          />
          <p>
            {d.periods.map((x: any) => (
              <Link key={x.id} to={base + "/agenda?ficha=" + x.id}>
                Abrir parte {x.part_number} ·{" "}
              </Link>
            ))}
          </p>
        </section>
      )}
      <div className="op-grid">
        <section className="card">
          <h2>
            {a.kind === "block" ? "Indisponibilidade" : "O que foi contratado"}
          </h2>
          {d.items.map((i: Data, n: number) => (
            <p key={n}>
              <strong>
                {i.quantity} × {i.name}
              </strong>{" "}
              · {i.price_mode === "from" ? "A partir de " : ""}
              {money(i.unit_cents)}
            </p>
          ))}
          {d.quote && (
            <p>
              {d.accepted
                ? "Proposta aprovada"
                : "Referência comercial — ainda sem aprovação registrada"}{" "}
              · Versão {d.quote.version} · {money(d.quote.total_cents)}
            </p>
          )}
          <p className="op-hint">
            Concluir o serviço não registra pagamento ou receita.
          </p>
          <dl className="op-summary">
            {a.service_minutes != null && (
              <>
                <div>
                  <dt>Duração do serviço</dt>
                  <dd>{a.service_minutes} minutos</dd>
                </div>
                <div>
                  <dt>Intervalo de preparação</dt>
                  <dd>
                    {a.buffer_minutes ??
                      Math.round(
                        (Date.parse(a.ends_at) - Date.parse(a.starts_at)) /
                          60000,
                      ) - a.service_minutes}{" "}
                    minutos
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt>Contato</dt>
              <dd>{d.customer?.whatsapp || "Não se aplica"}</dd>
            </div>
            <div>
              <dt>Janela reservada</dt>
              <dd>
                {Math.round(
                  (Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000,
                )}{" "}
                minutos
              </dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>
                {(
                  {
                    direct: "Direto / presencial",
                    whatsapp: "WhatsApp",
                    referral: "Indicação",
                    other: "Outra",
                    unknown: "Não informada",
                  } as Data
                )[d.source] ||
                  d.source ||
                  "Não informada"}
              </dd>
            </div>
            <div>
              <dt>Observações</dt>
              <dd>{a.note || d.request?.notes || "Nenhuma observação."}</dd>
            </div>
          </dl>
          {d.questions?.map((q: Data) => (
            <p key={q.code}>
              <strong>{q.label}</strong>
              <br />
              {String(d.request?.answers[q.code] ?? "Não informado")}
            </p>
          ))}
          {d.request && (
            <Link to={base + "/orcamentos?pedido=" + d.request.public_code}>
              Consultar orçamento relacionado →
            </Link>
          )}
        </section>
        <section className="card">
          <h2>Execução</h2>
          {s.data.financial_account && (
            <Link
              to={
                "/painel/" +
                org +
                "/financeiro?conta=" +
                s.data.financial_account.id
              }
            >
              Abrir cobrança e recebimentos
            </Link>
          )}
          <div className="op-quick">
            {edit("agenda.manage") &&
              a.state === "confirmed" &&
              a.execution_state === "scheduled" && (
                <>
                  {a.kind === "booking" && (
                    <button
                      className="primary"
                      onClick={() => setAction("start")}
                    >
                      Iniciar serviço
                    </button>
                  )}
                  <button onClick={() => setAction("reschedule")}>
                    {a.execution_group ? "Remarcar este período" : "Reagendar"}
                  </button>
                  <button onClick={() => setAction("cancel")}>
                    {a.kind === "block"
                      ? "Remover bloqueio"
                      : "Cancelar atendimento completo"}
                  </button>
                </>
              )}
            {edit("agenda.manage") && a.execution_state === "in_progress" && (
              <button className="primary" onClick={() => setAction("complete")}>
                Finalizar serviço
              </button>
            )}
          </div>
          <h2>Histórico</h2>
          {d.history.map((h: Data) => (
            <article key={h.id} className="op-attention">
              <strong>{label[h.event] || h.event}</strong>
              <p>{date(h.created_at)}</p>
              {h.event === "rescheduled" && (
                <small>
                  De {date(h.previous_start)} para {date(h.starts_at)}
                </small>
              )}
            </article>
          ))}
        </section>
      </div>
      {a.execution_group &&
        a.state === "confirmed" &&
        a.execution_state === "scheduled" &&
        edit("agenda.manage") && (
          <ExecutionBooking
            key={a.id}
            org={org}
            code={d.request.public_code}
            appointment={a}
            minutes={d.quote?.duration_minutes}
          />
        )}
      {action && edit("agenda.manage") && (
        <Dialog
          title={
            {
              start: "Iniciar serviço",
              complete: "Finalizar serviço",
              cancel: "Confirmar cancelamento",
              reschedule: "Escolher novo horário",
            }[action] || action
          }
          close={() => !busy && setAction("")}
        >
          <form
            className="op-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void apply(
                action === "reschedule"
                  ? {
                      start: localTime(
                        String(f.get("day")),
                        String(f.get("time")),
                      ),
                    }
                  : {},
              );
            }}
          >
            <p>
              {action === "reschedule"
                ? "A nova janela usa o intervalo de preparação vigente. Se não houver disponibilidade ou a ordem das etapas mudar, a reserva atual será preservada. Para reorganizar todos os períodos, use Replanejar atendimento."
                : action === "complete"
                  ? "A conclusão ficará registrada. Nenhum recebimento financeiro será presumido."
                  : action === "cancel"
                    ? "Todos os períodos ainda não iniciados deste atendimento serão cancelados juntos. O histórico será preservado."
                    : "Confirme que este atendimento já vai começar."}
            </p>
            {action === "reschedule" && (
              <>
                <label>
                  Dia
                  <input
                    name="day"
                    type="date"
                    required
                    defaultValue={dayOf(a.starts_at)}
                  />
                </label>
                <label>
                  Horário
                  <input
                    name="time"
                    type="time"
                    required
                    defaultValue={date(a.starts_at, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  />
                </label>
              </>
            )}
            {err && <p role="alert">{err}</p>}
            <button disabled={busy} className="primary">
              Confirmar
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
function CustomerFields() {
  return (
    <>
      <label>
        Nome
        <input
          name="name"
          minLength={2}
          maxLength={120}
          required
          autoComplete="off"
        />
      </label>
      <label>
        WhatsApp com DDD
        <input
          name="phone"
          inputMode="tel"
          pattern="[0-9]{10,15}"
          required
          placeholder="Somente números"
        />
      </label>
      <label>
        E-mail (opcional)
        <input name="email" type="email" maxLength={254} />
      </label>
      <label className="check">
        <input name="notice" type="checkbox" required />
        Confirmei com o cliente o uso dos dados para registrar e acompanhar seu
        atendimento.
      </label>
      <label className="check">
        <input name="contact" type="checkbox" />O cliente autorizou contato
        sobre este atendimento. Não inclui marketing.
      </label>
    </>
  );
}
const customerData = (f: FormData) => ({
  name: f.get("name"),
  whatsapp: f.get("phone"),
  email: f.get("email"),
  accepted_notice: f.get("notice") === "on",
  contact: f.get("contact") === "on",
});
function Customers({ org }: { org: string }) {
  const { can, data: permissionData } = usePermissions();
  const edit = (action: string) =>
    can(action) &&
    !["own_attendant", "shared_attendant"].includes(permissionData?.role || "");
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    s = useData("operations_directory", {
      p_org: org,
      p_search: search,
      p_offset: offset,
    });
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await rpc("operations_customer", {
        p_org: org,
        p_data: customerData(f),
        p_key: crypto.randomUUID(),
      });
      setParams({});
      await s.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="op-head">
        <div>
          <h1>Clientes</h1>
          <p>
            Cadastros da sua empresa. Telefone igual não mescla pessoas nem
            concede acesso.
          </p>
        </div>
        <button
          hidden={!edit("clients.manage")}
          className="primary"
          onClick={() => setParams({ novo: "1" })}
        >
          + Novo cliente
        </button>
      </header>
      <label>
        Buscar cliente
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          maxLength={120}
        />
      </label>
      {!s.data ? (
        <Loading s={s} />
      ) : (
        <section className="card op-table-list">
          {s.data.customers.slice(0, 50).map((c: Data) => (
            <article key={c.id}>
              <div>
                <h3>{c.name}</h3>
                <p>
                  {c.whatsapp} {c.email && "· " + c.email}
                </p>
              </div>
              <Link
                hidden={!edit("agenda.manage")}
                to={"/painel/" + org + "/novo-agendamento?cliente=" + c.id}
              >
                Agendar →
              </Link>
            </article>
          ))}
          {!s.data.customers.length && (
            <p className="op-empty">
              Nenhum cliente encontrado. Você pode cadastrar alguém acima.
            </p>
          )}
          <div className="op-quick">
            <button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Anterior
            </button>
            <button
              disabled={s.data.customers.length <= 50}
              onClick={() => setOffset(offset + 50)}
            >
              Próximos clientes
            </button>
          </div>
        </section>
      )}
      {edit("clients.manage") && params.has("novo") && (
        <Dialog title="Novo cliente" close={() => !busy && setParams({})}>
          <form className="op-form" onSubmit={save}>
            <CustomerFields />
            {error && <p role="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              Salvar cliente
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
function NewRequest({ org, booking }: { org: string; booking: boolean }) {
  const { can, data: permissionData } = usePermissions();
  const edit = (action: string) =>
    can(action) &&
    !["own_attendant", "shared_attendant"].includes(permissionData?.role || "");
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    [customer, setCustomer] = useState(params.get("cliente") || ""),
    [search, setSearch] = useState(""),
    [service, setService] = useState(""),
    [addons, setAddons] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [request, setRequest] = useState<Data | null>(null),
    customerRef = useRef<string | null>(null),
    requestKey = useRef(crypto.randomUUID()),
    customerKey = useRef(crypto.randomUUID()),
    bookingKey = useRef(crypto.randomUUID()),
    s = useData("operations_directory", {
      p_org: org,
      p_search: search,
      p_offset: 0,
    });
  const selected = s.data?.catalog?.services?.find(
    (x: Data) => x.code === service,
  );
  const duration =
    selected?.duration_minutes +
    (selected?.addons || [])
      .filter((a: Data) => addons.includes(a.code))
      .reduce((sum: number, a: Data) => sum + (a.duration_minutes || 0), 0);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      let cid = customer || customerRef.current;
      if (!cid) {
        cid = await rpc<string>("operations_customer", {
          p_org: org,
          p_data: customerData(f),
          p_key: customerKey.current,
        });
        customerRef.current = cid;
      }
      let q = request;
      if (!q) {
        const answers: Data = {};
        for (const question of selected.questions || []) {
          const val = f.get(question.code);
          if (val != null && val !== "")
            answers[question.code] =
              question.kind === "number"
                ? Number(val)
                : question.kind === "boolean"
                  ? val === "true"
                  : val;
        }
        q = await rpc<Data>("operations_request", {
          p_org: org,
          p_customer: cid,
          p_service: service,
          p_addons: addons,
          p_answers: answers,
          p_notes: f.get("notes"),
          p_source: f.get("source"),
          p_key: requestKey.current,
        });
        setRequest(q);
      }
      if (booking) {
        const a = await rpc<Data>("operations_schedule", {
          p_org: org,
          p_request: q.id,
          p_start: localTime(String(f.get("day")), String(f.get("time"))),
          p_duration: Number(f.get("duration")),
          p_note: f.get("notes"),
          p_key: bookingKey.current,
        });
        navigate("/painel/" + org + "/agenda?ficha=" + a.id);
      } else navigate("/painel/" + org + "/orcamentos?pedido=" + q.code);
    } catch (e) {
      setError(errorMessage(e));
      bookingKey.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{booking ? "Novo agendamento" : "Novo orçamento"}</h1>
      <p>
        Registre quem chegou pelo WhatsApp, telefone, indicação ou
        presencialmente.
      </p>
      {!s.data ? (
        <Loading s={s} />
      ) : !s.data.catalog ? (
        <p className="notice">
          Primeiro prepare e publique o catálogo em{" "}
          <Link to={"/painel/" + org + "/consumidor#publicacao"}>
            Configurações da página
          </Link>
          .
        </p>
      ) : (
        <form className="op-form card" onSubmit={save}>
          <fieldset disabled={busy || Boolean(request)}>
            <legend>Cliente e serviço</legend>
            <label>
              Localizar cliente
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={120}
              />
            </label>
            <label>
              Cliente
              <select
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value);
                  customerRef.current = null;
                }}
              >
                <option value="">Cadastrar novo cliente</option>
                {s.data.customers.slice(0, 50).map((c: Data) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.whatsapp}
                  </option>
                ))}
              </select>
            </label>
            {!customer && !customerRef.current && <CustomerFields />}
            <label>
              Serviço
              <select
                required
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  setAddons([]);
                }}
              >
                <option value="">Escolha um serviço</option>
                {s.data.catalog.services.map((x: Data) => (
                  <option key={x.code} value={x.code}>
                    {x.name} · {x.price_mode === "from" ? "a partir de " : ""}
                    {money(x.price_cents)}
                  </option>
                ))}
              </select>
            </label>
            {selected?.addons.map((a: Data) => (
              <label className="check" key={a.code}>
                <input
                  type="checkbox"
                  checked={addons.includes(a.code)}
                  onChange={(e) =>
                    setAddons(
                      e.target.checked
                        ? [...addons, a.code]
                        : addons.filter((x) => x !== a.code),
                    )
                  }
                />
                {a.name} · {money(a.price_cents)}
              </label>
            ))}
            {selected?.questions.map((q: Data) => (
              <label key={q.code}>
                {q.label}
                {q.required ? " *" : ""}
                {q.kind === "choice" || q.kind === "boolean" ? (
                  <select name={q.code} required={q.required}>
                    <option value="">Selecione</option>
                    {(q.kind === "boolean" ? ["true", "false"] : q.options).map(
                      (o: string) => (
                        <option value={o} key={o}>
                          {o === "true" ? "Sim" : o === "false" ? "Não" : o}
                        </option>
                      ),
                    )}
                  </select>
                ) : (
                  <input
                    name={q.code}
                    type={q.kind === "number" ? "number" : "text"}
                    maxLength={2000}
                    required={q.required}
                  />
                )}
              </label>
            ))}
            <label>
              Origem
              <select name="source">
                <option value="whatsapp">WhatsApp</option>
                <option value="direct">Presencial / telefone</option>
                <option value="referral">Indicação</option>
                <option value="instagram">Instagram</option>
                <option value="other">Outra</option>
              </select>
            </label>
          </fieldset>
          <label>
            Observações
            <textarea name="notes" maxLength={1000} />
          </label>
          {booking && (
            <fieldset disabled={busy}>
              <legend>Horário</legend>
              <label>
                Dia
                <input
                  name="day"
                  type="date"
                  required
                  defaultValue={add(today(), 1)}
                />
              </label>
              <label>
                Horário
                <input name="time" type="time" required defaultValue="08:00" />
              </label>
              <label>
                Duração do serviço (minutos)
                <input
                  key={duration || 0}
                  name="duration"
                  type="number"
                  min={1}
                  max={10080}
                  defaultValue={duration || 60}
                  required
                />
              </label>
              <p>
                O horário é validado ao confirmar, incluindo intervalos,
                bloqueios e outras reservas.
              </p>
            </fieldset>
          )}
          {request && (
            <p className="notice">
              Solicitação salva. Ajuste o horário para concluir o agendamento.{" "}
              <Link
                to={"/painel/" + org + "/orcamentos?pedido=" + request.code}
              >
                Abrir solicitação
              </Link>
            </p>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || !selected}>
            {busy
              ? "Salvando…"
              : booking
                ? "Confirmar agendamento"
                : "Criar solicitação de orçamento"}
          </button>
        </form>
      )}
    </>
  );
}
function Quotes({ org }: { org: string }) {
  const { can, data: permissionData } = usePermissions();
  const edit = (action: string) =>
    can(action) &&
    !["own_attendant", "shared_attendant"].includes(permissionData?.role || "");
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    s = useData("operations_requests", {
      p_org: org,
      p_search: search,
      p_offset: offset,
    });
  if (params.has("pedido"))
    return (
      <QuoteEditor
        key={params.get("pedido")}
        org={org}
        code={params.get("pedido")!}
      />
    );
  return (
    <>
      <header className="op-head">
        <div>
          <h1>Orçamentos</h1>
          <p>Solicitações, propostas e aprovações em um só lugar.</p>
        </div>
        {edit("quotes.manage") && can("quotes.values") && (
          <Link className="primary" to={"/painel/" + org + "/novo-orcamento"}>
            + Novo orçamento
          </Link>
        )}
      </header>
      <label>
        Buscar cliente ou serviço
        <input
          value={search}
          maxLength={120}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      {!s.data ? (
        <Loading s={s} />
      ) : (
        <section className="card op-table-list">
          {s.data.slice(0, 50).map((q: Data) => (
            <article key={q.id}>
              <div>
                <h3>{q.customer}</h3>
                <p>
                  {q.service} · {label[q.state] || q.state}
                </p>
              </div>
              <button onClick={() => setParams({ pedido: q.code })}>
                Abrir solicitação
              </button>
            </article>
          ))}
          {!s.data.length && (
            <p className="op-empty">
              Nenhuma solicitação por aqui. Crie um orçamento ou compartilhe sua
              página com seus clientes.
            </p>
          )}
          <div className="op-quick">
            <button disabled={!offset} onClick={() => setOffset(offset - 50)}>
              Anterior
            </button>
            <button
              disabled={s.data.length <= 50}
              onClick={() => setOffset(offset + 50)}
            >
              Próximos orçamentos
            </button>
          </div>
        </section>
      )}
    </>
  );
}
function QuoteEditor({ org, code }: { org: string; code: string }) {
  const { can, data: permissions } = usePermissions();
  const s = useData("operations_quote_context", { p_org: org, p_code: code });
  if (!s.data) return <Loading s={s} />;
  const d = s.data;
  return (
    <>
      <Link to={"/painel/" + org + "/orcamentos"}>← Orçamentos</Link>
      <h1>Proposta para {d.name}</h1><RequestContact key={code} org={org} request={code} version={can("quotes.values") ? (d.versions.find((v:any)=>v.code===d.current_version) || d.versions.at(-1)) : undefined}/>
      <details>
        <summary>Ver pedido original</summary>
        <RequestedItems data={d} />
      </details>
      {can("quotes.manage") &&
      !(
        d.journey === "direct" &&
        d.appointments?.some((a: any) => a.state === "confirmed")
      ) &&
      can("quotes.values") &&
      permissions?.role !== "shared_attendant" &&
      ["submitted", "under_review", "quoted", "declined"].includes(d.state) ? (
        <QuoteCalculator key={code} org={org} request={d} onSent={s.reload} />
      ) : (
        <p>
          A montagem da proposta depende da permissão da empresa e da etapa do
          pedido.
        </p>
      )}
      {d.booking?.ready &&
        !d.appointments?.some((a: any) => a.state === "confirmed") &&
        can("agenda.manage") &&
        !["own_attendant", "shared_attendant"].includes(
          permissions?.role || "",
        ) && (
          <ExecutionBooking
            org={org}
            code={code}
            minutes={
              d.versions.find((v: any) => v.code === d.accepted_version)
                ?.duration_minutes
            }
          />
        )}
      <section className="card">
        <h2>Versões enviadas</h2>
        {d.versions.map((v: Data) => (
          <article key={v.code}>
            {can("quotes.values") && <DocumentButton company request={code} reference={v.code}/>}
            <h3>
              {v.kind === "estimate"
                ? "Solicitação inicial"
                : "Proposta " + v.version}
              {d.accepted_version === v.code ? " · Aprovada" : ""}
            </h3>
            {v.kind === "final" ? (
              <QuoteSummary quote={v} />
            ) : (
              <OrderPrices items={v.items} />
            )}
          </article>
        ))}
      </section>
    </>
  );
}
