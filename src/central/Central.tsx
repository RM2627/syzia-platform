import { MessageThread, composerEnter } from "./MessageThread";
import { useVisiblePolling } from "../ui/useVisiblePolling";
import {
  ExecutionSchedule,
  Periods,
  type Period,
} from "../scheduling/ExecutionSchedule";
import { RequestPhotos } from "./RequestPhotos";
import { QuoteCalculator } from "../operations/QuoteCalculator";
import { sources as sourceLabels } from "../commercial/model";
import { sections as manualLabels, priceLabel } from "../company/model";
import { RequestedItems, OrderPrices } from "../consumer/RequestedItems";
import { AccountDetail } from "../finance/Finance";
import { useDraft, DraftConflict } from "../ui/useDraft";
import { useCallback, useEffect, useRef, useState, useId } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { rpc, supabase } from "../api";
import { gateway } from "../consumer/api";
import { ticketPath } from "./navigation";
import {
  states,
  actions,
  events,
  money,
  date,
  waitTime,
  centralError,
} from "./model";
import "./central.css";
type Row = any;
export function Central({
  companyOrg,
  companyPending = true,
}: {
  companyOrg?: string;
  companyPending?: boolean;
}) {
  const route = useParams();
  const [query] = useSearchParams();
  const code = route.code || query.get("ticket") || undefined;
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState(companyOrg && companyPending ? "company" : "mine"),
    [search, setSearch] = useState(""),
    [org, setOrg] = useState(companyOrg || ""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("priority"),
    [entryDate, setEntryDate] = useState(""),
    [offset, setOffset] = useState(0);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const g = ++generation.current;
    try {
      const d = await rpc<any>("central_queue", {
        p_org: companyOrg || org || null,
        p_search: search,
        p_state: status || null,
        p_mine: tab === "mine",
        p_offset: offset,
        p_view: ["general", "company", "resolved"].includes(tab) ? tab : "all",
        p_date: entryDate || null,
      });
      if (g === generation.current) {
        setData(d);
        setError("");
      }
    } catch (e) {
      if (g === generation.current) {
        if ((e as any).code === "42501") setData(undefined);
        setError(centralError(e));
      }
    }
  }, [companyOrg, org, search, status, tab, offset, entryDate]);
  useVisiblePolling(load, 15000);
  useEffect(() => () => { generation.current++; }, [load]);
  async function presence(value: string) {
    try {
      await rpc("central_presence", { p_state: value });
      await load();
    } catch (e) {
      setError(centralError(e));
    }
  }
  let rows: Row[] = (data?.tickets || []).filter((x: Row) =>
    tab === "general"
      ? !x.assignee || !x.owner_valid
      : tab === "company"
        ? x.state === "waiting_company"
        : tab === "resolved"
          ? x.state === "resolved"
          : true,
  );
  rows = [...rows].sort((a, b) =>
    sort === "company"
      ? a.company.localeCompare(b.company)
      : sort === "state"
        ? a.state.localeCompare(b.state)
        : sort === "next"
          ? a.next_action.localeCompare(b.next_action)
          : sort === "owner"
            ? (a.assignee_name || "").localeCompare(b.assignee_name || "")
            : sort === "appointment"
              ? (a.appointment || "z").localeCompare(b.appointment || "z")
              : sort === "wait"
                ? a.waiting_since.localeCompare(b.waiting_since)
                : ({ overdue: 2, attention: 1, normal: 0 }[b.sla as "normal"] ||
                    0) -
                    ({ overdue: 2, attention: 1, normal: 0 }[
                      a.sla as "normal"
                    ] || 0) ||
                  b.priority - a.priority ||
                  a.waiting_since.localeCompare(b.waiting_since),
  );
  return (
    <section className="central">
      <header className="h-title">
        <div>
          <span className="h-eyebrow">ATENDIMENTO · SUA EQUIPE EM CONTATO</span>
          <h1>
            {companyOrg && companyPending
              ? "Pendências da empresa"
              : "Central de atendimento"}
          </h1>
          <p>Uma empresa por contexto. Cada decisão no seu lugar.</p>
        </div>
        {!(companyOrg && companyPending) && (
          <label>
            Minha presença
            <select
              aria-label="Minha presença"
              value={data?.presence || "offline"}
              onChange={(e) => void presence(e.target.value)}
            >
              <option value="offline">Offline</option>
              <option value="available">Disponível</option>
              <option value="busy">Ocupado</option>
              <option value="pause">Em pausa</option>
            </select>
          </label>
        )}
      </header>
      {error && (
        <p role="alert" className="h-alert">
          {error}
        </p>
      )}
      <div className="h-today" aria-label="Hoje">
        <div>
          <b>
            {data?.tickets.filter((x: Row) => x.state === "queued").length || 0}
          </b>
          <span>Novos na fila</span>
        </div>
        <div>
          <b>
            {data?.tickets.filter((x: Row) =>
              ["queued", "active"].includes(x.state),
            ).length || 0}
          </b>
          <span>Clientes esperando</span>
        </div>
        <div>
          <b>
            {data?.tickets.filter((x: Row) => x.sla === "overdue").length || 0}
          </b>
          <span>Atrasados</span>
        </div>
        <div>
          <b>
            {data?.tickets.filter((x: Row) => x.appointment_today).length || 0}
          </b>
          <span>Agendas de hoje</span>
        </div>
        <div>
          <b>
            {data?.tickets.filter((x: Row) => x.state === "waiting_company")
              .length || 0}
          </b>
          <span>Decisão da empresa</span>
        </div>
        <div>
          <b>
            {data?.tickets.filter(
              (x: Row) =>
                x.assignee === data.me &&
                !["closed", "resolved"].includes(x.state),
            ).length || 0}
          </b>
          <span>Minha carga</span>
        </div>
      </div>
      <p className="h-small">
        Contagens e ordenações dos resultados carregados. Prioridade: prazo
        vencido → atenção → urgência manual → tempo de espera. Sem prazo
        configurado, nenhum SLA é prometido.
      </p>
      <p className="h-small">
        Retornos necessários:{" "}
        {data?.tickets.filter((x: Row) => x.next_action === "follow_up")
          .length || 0}
        {" · "}Orçamentos aguardando ação:{" "}
        {data?.tickets.filter(
          (x: Row) => x.next_action === "quote" || x.request_state === "quoted",
        ).length || 0}
        {" · "}Resolvidos:{" "}
        {data?.tickets.filter((x: Row) => x.state === "resolved").length || 0}
      </p>
      <nav className="h-tabs">
        {[
          ["mine", "Minha fila"],
          ["general", "Fila geral"],
          ["all", "Todos"],
          ["company", "Aguardando empresa"],
          ["resolved", "Resolvidos recentes"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={tab === v ? "selected" : ""}
            onClick={() => {
              setTab(v);
              setOffset(0);
            }}
          >
            {l}
          </button>
        ))}
      </nav>
      <div className="h-filters">
        <label>
          Buscar cliente, empresa ou ticket
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Nome, serviço, origem ou responsável"
          />
        </label>
        {!(companyOrg && companyPending) && (
          <label>
            Empresa
            <select
              value={org}
              disabled={!!companyOrg}
              onChange={(e) => {
                setOrg(e.target.value);
                setData(undefined);
                setOffset(0);
              }}
            >
              <option value="">Todas autorizadas</option>
              {data?.organizations.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(states).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data de entrada
          <input
            type="date"
            value={entryDate}
            onChange={(e) => {
              setEntryDate(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Ordenar
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {[
              ["priority", "Prioridade"],
              ["wait", "Tempo de espera"],
              ["company", "Empresa"],
              ["state", "Estado"],
              ["owner", "Responsável"],
              ["next", "Próxima ação"],
              ["appointment", "Agendamento próximo"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void load()}>Atualizar fila</button>
      </div>
      <div className={"h-layout " + (code ? "with-ticket" : "")}>
        <section className="h-queue" aria-label="Fila de atendimentos">
          <div className="h-queue-title">
            <h2>{rows.length} atendimentos</h2>
            <span>Empresa · cliente · próxima ação</span>
          </div>
          {rows.map((x) => (
            <Link
              className={"h-ticket " + (code === x.code ? "active" : "")}
              key={x.code}
              to={ticketPath(x.code, companyOrg, { pending: companyPending })}
            >
              <div className="h-row">
                <span className="h-company">{x.company}</span>
                <span className={"h-pill " + x.sla}>
                  {x.sla === "overdue"
                    ? "Atrasado"
                    : x.sla === "attention"
                      ? "Atenção"
                      : waitTime(x.waiting_since)}
                </span>
              </div>
              <h3>{x.customer}</h3>
              {x.unread_count > 0 && <span className="unread-count">{x.unread_count} não lida{x.unread_count === 1 ? "" : "s"}</span>}
              <p>
                {x.service} · {sourceLabels[x.source] || "Origem informada"}
              </p>
              <div className="h-row">
                <span>{states[x.state]}</span>
                <strong>
                  {x.priority === 2
                    ? "Urgente"
                    : x.priority === 0
                      ? "Baixa"
                      : "Normal"}
                </strong>
              </div>
              <p className="h-next">↗ {actions[x.next_action]}</p>
              <small>
                {x.assignee_name || "Sem responsável"} · {x.code.slice(0, 10)}
              </small>
            </Link>
          ))}
          {!rows.length && (
            <div className="h-empty">
              <b>Fila organizada.</b>
              <p>
                Nenhum atendimento neste filtro. Consulte a fila geral ou ajuste
                a busca.
              </p>
            </div>
          )}
          <div className="h-pagination">
            <button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            >
              Anterior
            </button>
            <span>Página {offset / 100 + 1}</span>
            <button
              disabled={!data?.has_more}
              onClick={() => setOffset(offset + 100)}
            >
              Próxima
            </button>
          </div>
        </section>
        {code ? (
          <Ticket
            key={(companyOrg || "global") + ":" + code}
            code={code}
            companyOrg={companyOrg}
            presence={data?.presence || "offline"}
            queuePath={
              companyOrg
                ? `/painel/${companyOrg}/${companyPending ? "pendencias" : "atendimento"}`
                : "/central"
            }
            onChange={load}
          />
        ) : (
          <section className="h-start">
            <span>◎</span>
            <h2>Seu próximo atendimento começa aqui.</h2>
            <p>
              Escolha um ticket para abrir a conversa, as orientações disponíveis
              e as ações autorizadas.
            </p>
            <p>
              Quando precisar de uma decisão fora da sua autonomia,
              encaminhe à empresa.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}
function Ticket({
  code,
  companyOrg,
  presence,
  queuePath,
  onChange,
}: {
  code: string;
  companyOrg?: string;
  presence: string;
  queuePath: string;
  onChange: () => Promise<void>;
}) {
  const composerId=useId();
  const [ctx, setCtx] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState<{
      name: string;
      args: any;
      key: string;
    } | null>(null),
    [text, setText] = useState(""),
    [mode, setMode] = useState("message"),
    [draftRevision, setDraftRevision] = useState<number>(),
    [panel, setPanel] = useState(
      new URLSearchParams(location.search).get("panel") === "replies"
        ? "replies"
        : "context",
    ),
    [query, setQuery] = useState(""),
    [reply, setReply] = useState<number | null>(null),
    [recipient, setRecipient] = useState(""),
    [reason, setReason] = useState(""),
    [summary, setSummary] = useState(""),
    [question, setQuestion] = useState(""),
    [decision, setDecision] = useState(""),
    [discount, setDiscount] = useState(0),
    [quoteReason, setQuoteReason] = useState(""),
    [excludedQuoteItems, setExcludedQuoteItems] = useState<number[]>([]),
    [expires, setExpires] = useState(
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    ),
    [day, setDay] = useState(""),
    [slots, setSlots] = useState<string[]>([]),
    [executionStart, setExecutionStart] = useState(""),
    [executionPeriods, setExecutionPeriods] = useState<Period[]>([]),
    [photo, setPhoto] = useState(""),
    [next, setNext] = useState("review"),
    [due, setDue] = useState("");
  const gen = useRef(0),
    pending = useRef<{ payload: string; key: string }>({
      payload: "",
      key: "",
    });
  const load = useCallback(async () => {
    const g = ++gen.current;
    try {
      const x = await rpc<any>("central_context", { p_code: code });
      if (g !== gen.current) return;
      // Server authorization remains authoritative. Also prevent a user with
      // access to both tenants from rendering B's ticket inside A's workspace.
      if (
        x.ticket.public_code !== code ||
        (companyOrg && x.organization.id !== companyOrg)
      ) {
        setCtx(undefined);
        setError("Atendimento indisponível neste contexto empresarial.");
        return;
      }
      setCtx(x);
    } catch (e) {
      if (g === gen.current) {
        if ((e as any).code === "42501") setCtx(undefined);
        setError(centralError(e));
      }
    }
  }, [code, companyOrg]);
  useVisiblePolling(load, 12000);
  useEffect(() => () => { gen.current++; }, [load]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  const submitting = useRef(false);
  async function operation(name: string, args: any, recovering = false) {
    if (submitting.current) throw Error("operation_in_progress");
    if (uncertain && !recovering) {
      setError(
        "Confirme o resultado do envio anterior antes de realizar outra ação.",
      );
      throw Error("previous_result_unknown");
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    const payload = JSON.stringify({ name, args });
    if (pending.current.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    try {
      const key = recovering && uncertain ? uncertain.key : pending.current.key;
      const r = await rpc<any>(name, { ...args, p_key: key });
      setUncertain(null);
      pending.current = { payload: "", key: "" };
      // Both reads observe the completed command and are independent.
      await Promise.all([load(), onChange()]);
      return r;
    } catch (e: any) {
      if (/^[0-9A-Z]{5}$/.test(e?.code || "")) {
        setUncertain(null);
        pending.current = { payload: "", key: "" };
      } else {
        setUncertain({
          name,
          args,
          key: recovering && uncertain ? uncertain.key : pending.current.key,
        });
      }
      setError(centralError(e));
      await load();
      throw e;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function act(
    action: string,
    data: any = {},
    revision = ctx.ticket.revision,
  ) {
    return operation("central_act", {
      p_code: code,
      p_revision: revision,
      p_action: action,
      p_data: data,
    });
  }
  const safe = (fn: () => Promise<any>) => {
    void fn().catch(() => {});
  };
  if (!ctx)
    return (
      <section className="h-work">
        <Link to={queuePath}>Voltar à fila</Link>
        <p role={error ? "alert" : "status"}>
          {error || "Abrindo contexto autorizado…"}
        </p>
        <button onClick={() => void load()}>Atualizar atendimento</button>
      </section>
    );
  const t = ctx.ticket,
    q = ctx.request,
    own = t.assignee_id === ctx.me || ctx.admin,
    active = own && !["closed", "resolved"].includes(t.state),
    permitted = (action: string) => ctx.action_permissions?.[action] === true,
    can = active && permitted("central.manage"),
    canReply =
      active &&
      permitted(mode === "message" ? "central.reply" : "central.manage"),
    stale = draftRevision !== undefined && draftRevision !== t.revision;
  const manual = ctx.manual.snapshot,
    appointment = q.appointments.find((a: any) => a.state === "confirmed"),
    base = q.versions.find((v: any) => v.kind === "estimate"),
    estimated =
      permitted("quotes.values") &&
      base?.items.every((i: any) => i.price_mode === "fixed") &&
      base.items.length > excludedQuoteItems.length
        ? base.items
            .filter((_: any, n: number) => !excludedQuoteItems.includes(n))
            .reduce(
              (sum: number, i: any) =>
                sum + Math.floor((i.unit_cents * (100 - discount)) / 100),
              0,
            )
        : null;
  async function send() {
    await act(
      mode,
      mode === "message"
        ? {
            body: text,
            ...(reply === null
              ? {}
              : { reply_index: reply, manual_id: ctx.manual.id }),
          }
        : { body: text },
      draftRevision ?? t.revision,
    );
    setText("");
    setReply(null);
    setDraftRevision(undefined);
  }
  async function readImage(file: string) {
    try {
      const tk = await rpc<any>("central_attachment_ticket", {
          p_code: code,
          p_file: file,
        }),
        { data } = await supabase!.auth.getSession();
      const response = await fetch(gateway + "/attachments/" + file, {
        headers: {
          Authorization: "Bearer " + data.session?.access_token,
          "X-Download-Ticket": tk.ticket,
        },
      });
      if (!response.ok) throw Error();
      setPhoto(URL.createObjectURL(await response.blob()));
    } catch (e) {
      setError(centralError(e));
    }
  }
  return (
    <section className="h-work" aria-label="Atendimento selecionado">
      <Link to={queuePath}>Voltar à fila</Link>
      {uncertain && (
        <div className="h-alert" role="alert">
          A conexão não confirmou o envio anterior. Confira seu resultado antes
          de continuar; a mesma operação será recuperada sem duplicar efeitos.
          <button
            disabled={busy}
            onClick={() =>
              safe(async () => {
                const previous = uncertain;
                await operation(previous.name, previous.args, true);
                if (
                  previous.name === "central_act" &&
                  ["message", "note"].includes(previous.args.p_action)
                ) {
                  setText("");
                  setReply(null);
                  setDraftRevision(undefined);
                }
              })
            }
          >
            Confirmar resultado anterior
          </button>
        </div>
      )}
      <header className="h-work-head">
        <span className="h-company">{ctx.organization.name}</span>
        <div className="h-row">
          <h2>{ctx.customer.name}</h2>
          <span className="h-pill">{states[t.state]}</span>
        </div>
        <p>
          {q.requested_items?.length
            ? `${q.requested_items.length} serviço(s) · ${q.requested_items.map((i: any) => i.name).join(", ")}`
            : q.versions.at(-1)?.items[0]?.name}{" "}
          · Entrada {date(t.created_at)}
        </p>
        <p>
          Responsável:{" "}
          {ctx.recipients.find((r: any) => r.id === t.assignee_id)?.name ||
            "Sem responsável ativo"}{" "}
          · Espera {waitTime(t.waiting_since)}
        </p>
        <strong>
          Próxima ação: {actions[t.next_action]}
          {t.next_due_at ? " · " + date(t.next_due_at) : ""}
        </strong>
        {!ctx.claim_eligible && (
          <p role="status">
            Você não possui permissão para assumir atendimentos desta empresa. O
            administrador pode revisar suas permissões locais.
          </p>
        )}
        {ctx.shared_support?.waiting && (
          <p role="status">
            Aguardando apoio. A equipe compartilhada poderá auxiliar este
            atendimento quando houver disponibilidade. Entrar na fila não
            consome atendimento.
          </p>
        )}
        {ctx.shared_support?.actor_shared && presence !== "available" && (
          <p role="status">
            Sua presença está indisponível para assumir novos atendimentos.
            Selecione Disponível na Central quando puder assumir atendimentos da
            fila.
          </p>
        )}
        <div className="h-actions">
          <button
            disabled={
              busy ||
              !permitted("central.manage") ||
              !ctx.claim_eligible ||
              (ctx.shared_support?.actor_shared && presence !== "available") ||
              (!!t.assignee_id &&
                ctx.recipients.some((r: any) => r.id === t.assignee_id)) ||
              ["resolved", "closed", "waiting_company"].includes(t.state)
            }
            onClick={() => safe(() => act("claim"))}
          >
            Assumir atendimento
          </button>
          <button
            disabled={
              busy ||
              !permitted("central.manage") ||
              !ctx.claim_eligible ||
              !own ||
              ![
                "active",
                "waiting_customer",
                "waiting_internal",
                "queued",
              ].includes(t.state)
            }
            onClick={() => safe(() => act("state", { state: "resolved" }))}
          >
            Resolver
          </button>
          {t.state === "resolved" && (
            <>
              <button
                disabled={!own || busy || !permitted("central.manage")}
                onClick={() => safe(() => act("state", { state: "active" }))}
              >
                Reabrir
              </button>
              <button
                disabled={!own || busy || !permitted("central.manage")}
                onClick={() => safe(() => act("state", { state: "closed" }))}
              >
                Encerrar
              </button>
            </>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="h-alert">
          {error}
        </p>
      )}
      <div className="h-work-body">
        <section className="h-conversation">
          <h3>Conversa com o cliente</h3>
          <MessageThread key={code} messages={ctx.messages} onRead={async id => {
            await rpc("central_mark_read", {p_code:code,p_message:id}); await onChange();
          }} />
          <div className={"h-composer " + (mode === "note" ? "internal" : "")}>
            <div className="h-tabs">
              <button
                className={mode === "message" ? "selected" : ""}
                onClick={() => {
                  setMode("message");
                  setText("");
                  setReply(null);
                  setDraftRevision(undefined);
                }}
              >
                Mensagem ao cliente
              </button>
              <button
                className={mode === "note" ? "selected" : ""}
                onClick={() => {
                  setMode("note");
                  setText("");
                  setReply(null);
                  setDraftRevision(undefined);
                }}
              >
                Nota interna
              </button>
            </div>
            <label htmlFor={composerId}>
              {mode === "message"
                ? "Resposta pública ao cliente"
                : "Nota interna · nunca enviada ao cliente"}
            </label>
              <textarea id={composerId}
                onKeyDown={e => composerEnter(e, () => safe(send), !busy && !uncertain && canReply && Boolean(text.trim()) && !stale)}
                maxLength={mode === "message" ? 4000 : 2000}
                disabled={
                  !canReply ||
                  busy ||
                  Boolean(uncertain) ||
                  (reply !== null && !ctx.settings.quick_reply_edit)
                }
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (draftRevision === undefined) setDraftRevision(t.revision);
                }}
                placeholder={
                  mode === "message"
                    ? "Escreva uma resposta clara, conforme as orientações da empresa."
                    : "Registre somente contexto operacional necessário."
                }
              />
            {reply !== null && (
              <p className="h-small">
                Resposta de {ctx.organization.name}.{" "}
                {ctx.settings.quick_reply_edit
                  ? "Edição autorizada."
                  : "Texto aprovado; edição não autorizada."}{" "}
                <button
                  onClick={() => {
                    setReply(null);
                    setText("");
                    setDraftRevision(undefined);
                  }}
                >
                  Limpar resposta rápida
                </button>
              </p>
            )}
            {stale && !uncertain && (
              <p className="h-alert">
                O atendimento mudou enquanto você escrevia. Confira responsável,
                contexto e mensagens.
                <button
                  onClick={() => {
                    setDraftRevision(t.revision);
                    pending.current = { payload: "", key: "" };
                  }}
                >
                  Revisei a atualização
                </button>
              </p>
            )}
            <button
              className="h-primary"
              disabled={
                busy || Boolean(uncertain) || !canReply || !text.trim() || stale
              }
              onClick={() => safe(send)}
            >
              {mode === "message" ? "Enviar mensagem" : "Salvar nota interna"}
            </button>
            {!own && (
              <p className="h-small">
                Assuma o atendimento para responder. A atribuição é verificada
                no servidor.
              </p>
            )}
          </div>
          <details className="h-notes">
            <summary>Notas internas · {ctx.notes.length}</summary>
            {ctx.notes.map((n: any, i: number) => (
              <article key={i}>
                <small>
                  {n.author} · {date(n.at)}
                </small>
                <p>{n.body}</p>
              </article>
            ))}
          </details>
          <details>
            <summary>Histórico operacional · {ctx.events.length}</summary>
            {ctx.events.map((e: any, i: number) => (
              <p key={i} className="h-small">
                {date(e.at)} · {events[e.event] || e.event} ·{" "}
                {e.author || "Sistema"}
              </p>
            ))}
          </details>
        </section>
        <section
          className={"h-context " + (panel === "quote" ? "quote-open" : "")}
        >
          {t.routing_reason && (
            <p className="h-next">
              <strong>{t.routing_reason}</strong>
              <br />
              Quem precisa agir:{" "}
              {t.next_action === "customer"
                ? "cliente"
                : "equipe própria / ADM"}
              {q.desired_start && (
                <>
                  <br />
                  Horário pretendido: {date(q.desired_start)}
                </>
              )}
            </p>
          )}
          <nav className="h-context-tabs">
            {[
              ["context", "Contexto"],
              ["manual", "Manual"],
              ["replies", "Respostas"],
              ["quote", "Orçamento"],
              ["agenda", "Agenda"],
              ["company", "Encaminhar"],
              ["manage", "Organizar"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={panel === v ? "selected" : ""}
                onClick={() => {
                  setPanel(v);
                  setQuery("");
                }}
              >
                {l}
              </button>
            ))}
          </nav>
          {panel === "context" && (
            <>
              <h3>Para resolver agora</h3>
              <p className="h-next">{actions[t.next_action]}</p>
              <dl>
                <dt>Empresa</dt>
                <dd>{ctx.organization.name}</dd>
                <dt>Cliente</dt>
                <dd>{ctx.customer.name}</dd>
                <dt>Origem</dt>
                <dd>{ctx.origin?.source || "Acesso direto"}</dd>
                <dt>Recorrência</dt>
                <dd>{ctx.customer.request_count} solicitação(ões)</dd>
                <dt>Contato autorizado</dt>
                <dd>
                  {ctx.customer.whatsapp ||
                    "Não autorizado para contato externo"}
                </dd>
              </dl>
              {ctx.customer_context && (
                <div className="h-internal">
                  <b>Contexto autorizado · interno</b>
                  <p>{ctx.customer_context.tags?.join(" · ")}</p>
                  <p>{ctx.customer_context.preferred_time}</p>
                  <p>{ctx.customer_context.operational_note}</p>
                </div>
              )}
              <h4>Informações da solicitação</h4>
              {q.answers.map((a: any, i: number) => (
                <p key={i}>
                  <b>{a.label}</b>
                  <br />
                  {String(a.answer)}
                </p>
              ))}
              <p>{q.notes}</p>
              {q.attachments
                .filter((a: any) => a.state === "ready")
                .map((a: any, i: number) => (
                  <button key={a.code} onClick={() => void readImage(a.code)}>
                    Ver anexo autorizado {i + 1}
                  </button>
                ))}
              {photo && (
                <img
                  className="h-photo"
                  src={photo}
                  alt="Anexo autorizado desta solicitação"
                />
              )}
              <h4>Solicitações anteriores</h4>
              {ctx.customer.previous_requests.map((r: any) => (
                <p key={r.code}>
                  {date(r.created_at)} ·{" "}
                  {(
                    {
                      draft: "Rascunho",
                      submitted: "Solicitação enviada",
                      quoted: "Proposta enviada",
                      approved: "Aprovada",
                      declined: "Recusada",
                      under_review: "Em análise",
                      cancelled: "Cancelada",
                    } as Record<string, string>
                  )[r.state] || "Solicitação"}{" "}
                  · {r.code.slice(0, 10)}
                </p>
              ))}
              {ctx.financial?.operational && ctx.financial.account && (
                <AccountDetail
                  org={ctx.organization.id}
                  id={ctx.financial.account.id}
                />
              )}
            </>
          )}
          {panel === "manual" && (
            <>
              <h3>{ctx.manual.id ? `Manual publicado · v${ctx.manual.version}` : "Manual da empresa — Opcional"}</h3>
              {!ctx.manual.id && <p>Nenhum Manual publicado. A equipe própria pode atender conforme suas permissões e os limites definidos pela empresa.</p>}
              <label>
                Buscar no manual
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Desconto, atraso, garantia…"
                />
              </label>
              {ctx.manual.sections
                .filter((s: any) =>
                  (
                    (manualLabels[s.key] || s.key) +
                    " " +
                    s.key +
                    " " +
                    s.content
                  )
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((s: any) => (
                  <details key={s.key}>
                    <summary>
                      {manualLabels[s.key] || "Informações do atendimento"}
                    </summary>
                    <p>{s.content}</p>
                  </details>
                ))}
              <details>
                <summary>Catálogo e preços autorizados</summary>
                {manual?.services?.map((s: any) => (
                  <p key={s.id}>
                    <b>{s.name}</b>
                    <br />
                    {priceLabel(s)} · {s.duration_minutes} min
                  </p>
                ))}
              </details>
              <details>
                <summary>Regras, horários e formas de pagamento</summary>
                <p>{manual?.settings?.service_regions}</p>
                <p>{manual?.settings?.payment_methods}</p>
                {manual?.settings?.human_hours?.map((h: any, i: number) => (
                  <p key={i}>
                    Dia {h.day} · {h.open}–{h.close}
                  </p>
                ))}
                {Object.entries(manual?.rules || {})
                  .filter(([k]) => k.endsWith("_policy"))
                  .map(([k, v]) => (
                    <p key={k}>{String(v)}</p>
                  ))}
              </details>
              <details>
                <summary>FAQ autorizada</summary>
                {manual?.faqs?.map((f: any, i: number) => (
                  <p key={i}>
                    <b>{f.question}</b>
                    <br />
                    {f.answer}
                  </p>
                ))}
              </details>
              <div className="h-muted-box">
                <b>Autonomia efetiva</b>
                {Object.entries(ctx.permissions).map(([a, v]) => (
                  <p key={a}>
                    {a}:{" "}
                    {v ? "Ação autorizada" : "Precisa de aprovação da empresa"}
                  </p>
                ))}
                <p>
                  Desconto máximo publicado:{" "}
                  {manual?.permissions?.max_discount_percent || 0}%
                </p>
              </div>
            </>
          )}
          {panel === "replies" && (
            <>
              <h3>Respostas de {ctx.organization.name}</h3>
              <label>
                Buscar resposta
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                disabled={!can}
                onClick={() => {
                  setMode("message");
                  setReply(null);
                  setDraftRevision(t.revision);
                  setText(
                    `Olá! Sou ${ctx.operator_name || "integrante da equipe"}, do atendimento compartilhado da ${ctx.organization.name}. Como posso ajudar?`,
                  );
                }}
              >
                Preparar apresentação
              </button>
              {manual?.quick_replies
                ?.map((r: any, i: number) => ({ ...r, index: i }))
                .filter((r: any) =>
                  (r.title + " " + r.body)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((r: any) => (
                  <article className="h-reply" key={r.index}>
                    <h4>{r.title}</h4>
                    <p>{r.body}</p>
                    <button
                      disabled={!can}
                      onClick={() => {
                        setMode("message");
                        setReply(r.index);
                        setText(r.body);
                        setDraftRevision(t.revision);
                      }}
                    >
                      Preparar resposta
                    </button>
                  </article>
                ))}
              <p className="h-small">
                Selecione, revise e envie. Nenhum envio é automático.
              </p>
            </>
          )}
          {panel === "quote" && (
            <>
              <h3>Orçamento</h3>
              {ctx.can_request_photos &&
                ["submitted", "under_review", "quoted", "declined"].includes(
                  q.state,
                ) && (
                  <details>
                    <summary>Faltam fotos para avaliar?</summary>
                    <RequestPhotos
                      org={ctx.organization.id}
                      request={q}
                      onSent={load}
                    />
                  </details>
                )}
              <RequestedItems data={q} />
              {ctx.can_price &&
                !(
                  q.journey === "direct" &&
                  q.appointments?.some((a: any) => a.state === "confirmed")
                ) &&
                ["submitted", "under_review", "quoted", "declined"].includes(
                  q.state,
                ) && (
                  <QuoteCalculator
                    key={q.code}
                    org={ctx.organization.id}
                    request={q}
                    onSent={load}
                  />
                )}
              {q.versions.map((v: any) => (
                <article className="h-quote" key={v.code}>
                  <b>
                    Versão {v.version} ·{" "}
                    {v.kind === "final"
                      ? "Proposta final"
                      : "Solicitação inicial"}
                  </b>
                  {v.items.map((i: any, j: number) => (
                    <p className="h-row" key={j}>
                      <span>
                        {i.quantity} × {i.name}
                      </span>
                      <strong>{money(i.unit_cents)}</strong>
                    </p>
                  ))}
                  {v.kind === "estimate" ? (
                    <OrderPrices
                      items={v.items}
                      review={q.review_alerts?.length > 0}
                    />
                  ) : (
                    <strong>Proposta final {money(v.total_cents)}</strong>
                  )}
                  {v.customer_explanation && (
                    <p>Explicação ao cliente: {v.customer_explanation}</p>
                  )}
                  {v.expires_at && <p>Válido até {date(v.expires_at)}</p>}
                </article>
              ))}
              {!ctx.can_price && (
                <>
                  <p className="h-permission">
                    {ctx.permissions.quote_create && ctx.permissions.quote_send
                      ? "Ação autorizada dentro do preço publicado"
                      : "Precisa de aprovação da empresa"}
                  </p>
                  {base?.items.map((i: any, n: number) => (
                    <label className="check-field" key={n}>
                      <input
                        type="checkbox"
                        disabled={!ctx.permissions.quote_items || busy}
                        checked={!excludedQuoteItems.includes(n)}
                        onChange={(e) =>
                          setExcludedQuoteItems(
                            e.target.checked
                              ? excludedQuoteItems.filter((x) => x !== n)
                              : [...excludedQuoteItems, n],
                          )
                        }
                      />
                      Incluir {i.name} na proposta
                    </label>
                  ))}
                  <label>
                    Desconto (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Explicação da proposta para o cliente
                    <textarea
                      value={quoteReason}
                      onChange={(e) => setQuoteReason(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  <label>
                    Validade da proposta
                    <input
                      type="datetime-local"
                      value={expires}
                      onChange={(e) => setExpires(e.target.value)}
                    />
                  </label>
                  <p>Prévia: {money(estimated)}. O banco recalcula e valida.</p>
                  <button
                    disabled={
                      !can ||
                      busy ||
                      !permitted("quotes.manage") ||
                      !permitted("quotes.values") ||
                      !ctx.permissions.quote_send ||
                      !ctx.permissions.quote_create ||
                      estimated === null ||
                      !quoteReason.trim()
                    }
                    onClick={() =>
                      safe(() =>
                        operation("central_review_quote", {
                          p_positions: base.items
                            .map((_: any, n: number) => n)
                            .filter(
                              (n: number) => !excludedQuoteItems.includes(n),
                            ),
                          p_code: code,
                          p_revision: t.revision,
                          p_discount: discount,
                          p_expires: new Date(expires).toISOString(),
                          p_reason: quoteReason,
                          p_expected_cents: estimated,
                        }),
                      )
                    }
                  >
                    Enviar proposta autorizada
                  </button>
                  <p className="h-small">
                    A partir de, sob consulta ou preço desatualizado: encaminhe
                    para decisão da empresa. O cliente aprova a versão final.
                  </p>{" "}
                </>
              )}
            </>
          )}
          {panel === "agenda" && (
            <>
              <h3>Agenda da empresa</h3>
              {appointment && (
                <p className="h-next">
                  Confirmado: {date(appointment.starts_at)}
                </p>
              )}
              <p>
                {ctx.permissions.schedule
                  ? "Ação autorizada"
                  : "Precisa de aprovação da empresa"}{" "}
                · capacidade de um atendimento.
              </p>
              {q.appointments.filter((a: any) => a.state === "confirmed")
                .length > 1 && (
                <Periods
                  periods={q.appointments
                    .filter((a: any) => a.state === "confirmed")
                    .sort((a: any, b: any) => a.part_number - b.part_number)
                    .map((a: any) => ({
                      start: a.starts_at,
                      end: a.work_end || a.ends_at,
                      minutes: a.service_minutes,
                      reserved_until: a.ends_at,
                    }))}
                />
              )}
              {q.booking?.ready ? (
                <ExecutionSchedule
                  key={code + ":" + (appointment?.code || "")}
                  value={executionStart}
                  periods={executionPeriods}
                  onChange={(v, p) => {
                    setExecutionStart(v);
                    setExecutionPeriods(p);
                  }}
                  disabled={busy || !permitted("agenda.read")}
                  label={
                    appointment
                      ? "Replanejar atendimento completo"
                      : "Dia para atendimento"
                  }
                  load={(day, next) =>
                    rpc("central_execution_options", {
                      p_code: code,
                      p_day: day,
                      p_next: next,
                    })
                  }
                />
              ) : (
                <p>
                  O agendamento ficará disponível após a aprovação da proposta.
                </p>
              )}
              {executionStart && (
                <button
                  disabled={
                    !permitted("agenda.manage") ||
                    !can ||
                    busy ||
                    !(appointment
                      ? ctx.permissions.reschedule
                      : ctx.permissions.schedule)
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        "Confirmar todos os períodos apresentados?",
                      )
                    )
                      void safe(async () => {
                        await operation("central_book_execution", {
                          p_code: code,
                          p_revision: t.revision,
                          p_action: appointment ? "reschedule" : "schedule",
                          p_start: executionStart,
                          p_appointment: appointment?.code || null,
                          p_periods: executionPeriods,
                        });
                        setExecutionStart("");
                        setExecutionPeriods([]);
                      });
                  }}
                >
                  Confirmar{" "}
                  {appointment ? "replanejamento completo" : "agendamento"}
                </button>
              )}
              {appointment && (
                <button
                  disabled={
                    !can ||
                    busy ||
                    !ctx.permissions.cancel ||
                    !permitted("agenda.manage")
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancelar todos os períodos deste atendimento?",
                      )
                    )
                      safe(() =>
                        operation("central_booking", {
                          p_code: code,
                          p_revision: t.revision,
                          p_action: "cancel",
                          p_start: null,
                          p_appointment: appointment.code,
                        }),
                      );
                  }}
                >
                  Cancelar atendimento completo
                </button>
              )}
              <p className="h-small">
                Um conflito mantém a reserva anterior. Não há encaixe fora das
                regras.
              </p>
            </>
          )}
          {panel === "company" && (
            <>
              <h3>Decisão da empresa</h3>
              {ctx.escalations.map((e: any, i: number) => (
                <article className="h-escalation" key={i}>
                  <b>{e.reason}</b>
                  <p>{e.summary}</p>
                  <p>{e.question}</p>
                  {e.response ? (
                    <p className="h-next">Decisão registrada: {e.response}</p>
                  ) : (
                    <strong>Aguardando empresa</strong>
                  )}
                </article>
              ))}
              {permitted("pending.manage") && t.state === "waiting_company" ? (
                <>
                  <label>
                    Resposta da empresa
                    <textarea
                      maxLength={2000}
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || decision.trim().length < 2}
                    onClick={() =>
                      safe(async () => {
                        await act("decision", { response: decision });
                        setDecision("");
                      })
                    }
                  >
                    Registrar decisão
                  </button>
                </>
              ) : (
                <>
                  <label>
                    Motivo
                    <input
                      maxLength={120}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <label>
                    Resumo do contexto
                    <textarea
                      maxLength={2000}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                    />
                  </label>
                  <label>
                    Pergunta ou decisão necessária
                    <textarea
                      maxLength={1000}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={
                      !permitted("agenda.manage") ||
                      !can ||
                      busy ||
                      t.state === "waiting_company" ||
                      Math.min(
                        reason.trim().length,
                        summary.trim().length,
                        question.trim().length,
                      ) < 2
                    }
                    onClick={() =>
                      safe(() => act("escalate", { reason, summary, question }))
                    }
                  >
                    Encaminhar para empresa
                  </button>
                </>
              )}
              <p className="h-small">
                Decisões ficam no histórico interno. Uma resposta textual não
                concede novas permissões; a empresa precisa publicar alterações
                de autonomia.
              </p>
            </>
          )}
          {panel === "manage" && (
            <>
              <h3>Organizar atendimento</h3>
              <label>
                Transferir para
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                >
                  <option value="">Escolha atendente autorizado</option>
                  {ctx.recipients
                    .filter((r: any) => r.id !== t.assignee_id)
                    .map((r: any) => (
                      <option
                        key={r.id}
                        value={r.id}
                        disabled={r.shared_can_receive === false}
                      >
                        {r.name} ·{" "}
                        {r.kind === "backup" ? "Reserva" : "Principal"}
                        {r.shared_can_receive === false
                          ? " · Indisponível para novos atendimentos"
                          : ""}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!can || busy || !recipient}
                onClick={() =>
                  safe(() => act("transfer", { user_id: recipient }))
                }
              >
                Transferir
              </button>
              <button
                disabled={!can || busy || t.state === "waiting_company"}
                onClick={() => safe(() => act("return"))}
              >
                Devolver à fila
              </button>
              <label>
                Estado operacional
                <select
                  value={t.state}
                  disabled={!can || busy || t.state === "waiting_company"}
                  onChange={(e) =>
                    safe(() => act("state", { state: e.target.value }))
                  }
                >
                  {Object.entries(states)
                    .filter(
                      ([v]) =>
                        [
                          "active",
                          "waiting_customer",
                          "waiting_internal",
                        ].includes(v) || v === t.state,
                    )
                    .map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Prioridade
                <select
                  value={t.priority}
                  disabled={!can || busy}
                  onChange={(e) =>
                    safe(() =>
                      act("priority", { priority: Number(e.target.value) }),
                    )
                  }
                >
                  <option value="0">Baixa</option>
                  <option value="1">Normal</option>
                  <option value="2">Urgente</option>
                </select>
              </label>
              <label>
                Próxima ação
                <select value={next} onChange={(e) => setNext(e.target.value)}>
                  {Object.entries(actions).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prazo operacional opcional
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <button
                disabled={!can || busy}
                onClick={() =>
                  safe(() =>
                    act("next", {
                      action: next,
                      due_at: due ? new Date(due).toISOString() : null,
                    }),
                  )
                }
              >
                Salvar próxima ação
              </button>
              {permitted("settings.manage") && (
                <Settings key={ctx.organization.id} ctx={ctx} onChange={load} />
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
function Settings({
  ctx,
  onChange,
}: {
  ctx: any;
  onChange: () => Promise<void>;
}) {
  const draft = useDraft<any>(ctx.settings, ctx.settings.revision);
  const response = draft.value.response_minutes || "",
    attention = draft.value.attention_minutes || "",
    edit = !!draft.value.quick_reply_edit,
    share = !!draft.value.share_customer_context;
  const setResponse = (v: string) =>
    draft.set({ ...draft.value, response_minutes: v });
  const setAttention = (v: string) =>
    draft.set({ ...draft.value, attention_minutes: v });
  const setEdit = (v: boolean) =>
    draft.set({ ...draft.value, quick_reply_edit: v });
  const setShare = (v: boolean) =>
    draft.set({ ...draft.value, share_customer_context: v });
  const [error, setError] = useState("");
  return (
    <details>
      <summary>Configurações operacionais da empresa</summary>
      <DraftConflict conflict={draft.conflict} discard={draft.discard} />
      <label>
        Prazo de resposta (minutos, opcional)
        <input
          type="number"
          min="5"
          max="10080"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
      </label>
      <label>
        Atenção após (minutos, opcional)
        <input
          type="number"
          min="1"
          value={attention}
          onChange={(e) => setAttention(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={edit}
          onChange={(e) => setEdit(e.target.checked)}
        />
        Permitir editar respostas rápidas
      </label>
      <label>
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
        />
        Compartilhar contexto operacional do cliente com atendentes
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        onClick={() => {
          void rpc("central_settings_save", {
            p_org: ctx.organization.id,
            p_revision: draft.revision,
            p_data: {
              response_minutes: response ? Number(response) : null,
              attention_minutes: attention ? Number(attention) : null,
              quick_reply_edit: edit,
              share_customer_context: share,
            },
          })
            .then(async () => {
              await onChange();
              draft.saved();
            })
            .catch((e) => setError(centralError(e)));
        }}
      >
        Salvar configuração da Central
      </button>
    </details>
  );
}
