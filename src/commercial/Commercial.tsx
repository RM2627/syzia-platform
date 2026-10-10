import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { rpc } from "../api";
import { ticketPath } from "../central/navigation";
import { CommercialConfig } from "./Config";
import {
  states,
  kinds,
  taskStates,
  outcomes,
  reasons,
  sources,
  events,
  terminal,
  date,
  money,
  errorMessage,
} from "./model";
import "./commercial.css";
export function Commercial({ companyOrg }: { companyOrg?: string }) {
  const { code: routeCode } = useParams(),
    [query] = useSearchParams(),
    code = routeCode || query.get("op") || undefined,
    [data, setData] = useState<any>(),
    [filters, setFilters] = useState<any>({
      org: companyOrg || "",
      view: "all",
    }),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [settings, setSettings] = useState(false),
    [syncing, setSyncing] = useState(false),
    gen = useRef(0);
  const load = useCallback(async () => {
    const g = ++gen.current;
    try {
      const d = await rpc("commercial_list", {
        p_filters: filters,
        p_offset: offset,
      });
      if (g === gen.current) {
        setData(d);
        setError("");
      }
    } catch (e) {
      if (g === gen.current) {
        setData(undefined);
        setError(errorMessage(e));
      }
    }
  }, [filters, offset]);
  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      let cursor = null,
        n = 0;
      do {
        const d: any = await rpc("commercial_refresh", {
          p_org: filters.org || null,
          p_after: cursor,
        });
        cursor = d.next;
        n++;
      } while (cursor && n < 50);
      await load();
      if (cursor)
        setError("Há mais oportunidades para conciliar. Atualize novamente.");
    } catch (e) {
      setError(errorMessage(e));
      setData(undefined);
    } finally {
      setSyncing(false);
    }
  }, [filters.org, load]);
  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 30000);
    return () => {
      gen.current++;
      clearInterval(i);
    };
  }, [load]);
  const filter = (k: string, v: string) => {
      setFilters((f: any) => ({ ...f, [k]: v }));
      setOffset(0);
    },
    rows = data?.items || [],
    org = data?.organizations.find((x: any) => x.id === filters.org);
  return (
    <section className="commercial">
      <header className="co-heading">
        <div>
          <span className="co-eyebrow">COMERCIAL · RETORNOS HUMANOS</span>
          <h1>
            {companyOrg
              ? "Comercial da empresa"
              : "Cada oportunidade, uma próxima ação"}
          </h1>
          <p>
            Organize retornos, acompanhe decisões e preserve o contexto de cada
            cliente.
          </p>
        </div>
        <button disabled={syncing} onClick={() => void refresh()}>
          {syncing ? "Atualizando…" : "Atualizar retornos"}
        </button>
      </header>
      {error && (
        <p role="alert" className="co-error">
          {error}
        </p>
      )}
      <div className="co-summary">
        {[
          ["Pendentes", rows.filter((x: any) => x.task).length],
          ["Em atraso", rows.filter((x: any) => x.overdue).length],
          [
            "Cliente respondeu",
            rows.filter((x: any) => x.state === "responded").length,
          ],
          [
            "Convertidas",
            rows.filter((x: any) => x.state === "converted").length,
          ],
        ].map(([l, n]) => (
          <div key={l}>
            <b>{n}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <small>
        Contagens desta página. Horários no fuso da empresa. Nenhuma mensagem é
        enviada automaticamente.
      </small>
      <nav className="co-tabs" aria-label="Visões comerciais">
        {Object.entries({
          all: "Todas",
          today: "Hoje",
          upcoming: "Próximos",
          overdue: "Atrasados",
          responded: "Responderam",
          abandoned: "Abandonos elegíveis",
          finished: "Finalizados",
        }).map(([v, l]) => (
          <button
            key={v}
            className={filters.view === v ? "primary" : ""}
            onClick={() => filter("view", v)}
          >
            {l}
          </button>
        ))}
      </nav>
      <div className="co-filters">
        <label>
          Buscar cliente ou serviço
          <input
            value={filters.search || ""}
            maxLength={120}
            placeholder="Nome, interesse ou responsável"
            onChange={(e) => filter("search", e.target.value)}
          />
        </label>
        <label>
          Empresa
          <select
            value={filters.org}
            disabled={!!companyOrg}
            onChange={(e) => filter("org", e.target.value)}
          >
            <option value="">Todas autorizadas</option>
            {data?.organizations.map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            value={filters.state || ""}
            onChange={(e) => filter("state", e.target.value)}
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
          Responsabilidade
          <select
            value={filters.owner || ""}
            onChange={(e) => filter("owner", e.target.value)}
          >
            <option value="">Equipe</option>
            <option value="mine">Minhas tarefas</option>
          </select>
        </label>
      </div>
      <details>
        <summary>Mais filtros: origem, data, próxima ação e perda</summary>
        <div className="co-fields">
          <label>
            Origem
            <select
              value={filters.source || ""}
              onChange={(e) => filter("source", e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(sources).map(([v, l]) => (
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
              value={filters.date || ""}
              onChange={(e) => filter("date", e.target.value)}
            />
          </label>
          <label>
            Próxima ação
            <select
              value={filters.kind || ""}
              onChange={(e) => filter("kind", e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(kinds).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo da perda
            <input
              value={filters.loss_reason || ""}
              onChange={(e) => filter("loss_reason", e.target.value)}
              placeholder="Código configurado"
            />
          </label>
        </div>
      </details>
      {org?.admin && (
        <button onClick={() => setSettings(!settings)}>
          {settings ? "Fechar configuração" : "Configurar recuperação"}
        </button>
      )}
      {settings && org?.admin && (
        <CommercialConfig key={org.id} org={org.id} onChange={refresh} />
      )}
      <div className={"co-layout " + (code ? "has-detail" : "")}>
        <section className="co-queue" aria-label="Oportunidades">
          <div className="co-queue-title">
            <h2>Oportunidades</h2>
            <small>{rows.length} nesta página</small>
          </div>
          {rows.map((x: any) => (
            <Link
              className={"co-opportunity " + (code === x.code ? "active" : "")}
              key={x.code}
              to={
                companyOrg
                  ? `/painel/${companyOrg}/comercial?op=${encodeURIComponent(x.code)}`
                  : "/comercial/" + x.code
              }
            >
              <div className="co-line">
                <b className="co-company">{x.company}</b>
                <span className={"co-pill " + (x.overdue ? "late" : "")}>
                  {x.overdue ? "Retorno atrasado" : states[x.state]}
                </span>
              </div>
              <h3>{x.customer}</h3>
              <p>
                {x.service} · {money(x.value)}
              </p>
              <div className="co-line">
                <span>{kinds[x.kind] || "Sem retorno programado"}</span>
                <b>{x.attempt ? `${x.attempt}/${x.max_attempts}` : "—"}</b>
              </div>
              <small>
                {date(x.due, x.timezone)} · {x.owner || "Sem responsável"}
              </small>
              <small>
                Origem: {sources[x.source] || x.source} · Último contato:{" "}
                {date(x.last_contact, x.timezone)}
              </small>
            </Link>
          ))}
          {!rows.length && (
            <div className="co-empty">
              <h3>Tudo organizado neste filtro.</h3>
              <p>Consulte outras etapas ou ajuste os filtros.</p>
            </div>
          )}
          <div className="co-pagination">
            <button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            >
              Anterior
            </button>
            <small>Página {offset / 100 + 1}</small>
            <button
              disabled={!data?.has_more}
              onClick={() => setOffset(offset + 100)}
            >
              Próxima
            </button>
          </div>
        </section>
        {code ? (
          <Opportunity
            key={code}
            code={code}
            companyOrg={companyOrg}
            onChange={load}
          />
        ) : (
          <div className="co-welcome">
            <span className="co-eyebrow">PRÓXIMA AÇÃO</span>
            <h2>Abra uma oportunidade para continuar.</h2>
            <p>
              Consulte o histórico, confira a autorização de contato e trabalhe
              com a Central humana.
            </p>
            <ol>
              <li>Assuma a tarefa.</li>
              <li>Inicie no horário permitido.</li>
              <li>Converse e registre o resultado real.</li>
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
function Opportunity({
  code,
  companyOrg,
  onChange,
}: {
  code: string;
  companyOrg?: string;
  onChange: () => Promise<void>;
}) {
  const [ctx, setCtx] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [outcome, setOutcome] = useState("no_response"),
    [note, setNote] = useState(""),
    [due, setDue] = useState(""),
    [recipient, setRecipient] = useState(""),
    [loss, setLoss] = useState("price"),
    [uncertain, setUncertain] = useState<any>(null),
    gen = useRef(0);
  const load = useCallback(async () => {
    const g = ++gen.current;
    try {
      const d: any = await rpc("commercial_context", { p_code: code });
      if (g === gen.current && d.code === code) {
        if (companyOrg && d.organization_id !== companyOrg) {
          setCtx(undefined);
          setError("Oportunidade indisponível neste contexto empresarial.");
        } else {
          setCtx(d);
        }
      }
    } catch (e) {
      if (g === gen.current) {
        setCtx(undefined);
        setError(errorMessage(e));
      }
    }
  }, [code, companyOrg]);
  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 12000);
    return () => {
      gen.current++;
      clearInterval(i);
    };
  }, [load]);
  async function run(name: string, args: any, recovery = false) {
    if (uncertain && !recovery) {
      setError("Confirme o resultado anterior antes de outra ação.");
      return;
    }
    setBusy(true);
    setError("");
    const call = recovery
      ? uncertain
      : { name, args: { ...args, p_key: crypto.randomUUID() } };
    try {
      await rpc(call.name, call.args);
      setUncertain(null);
      setNote("");
      await load();
      await onChange();
    } catch (e: any) {
      setError(errorMessage(e));
      setUncertain(/^[0-9A-Z]{5}$/.test(e?.code || "") ? null : call);
      await load();
    } finally {
      setBusy(false);
    }
  }
  if (!ctx)
    return (
      <div className="co-detail">
        <p role={error ? "alert" : "status"}>
          {error || "Abrindo oportunidade…"}
        </p>
        <button onClick={() => void load()}>Atualizar oportunidade</button>
      </div>
    );
  const t = ctx.tasks.find(
      (x: any) => !["completed", "cancelled"].includes(x.state),
    ),
    own = t && (t.assignee_id === ctx.me || ctx.admin),
    can = ctx.can_operate && !terminal(ctx.state),
    blocked = busy || Boolean(uncertain);
  const act = (action: string, data: any = {}) =>
      void run("commercial_task_act", {
        p_code: t.public_code,
        p_revision: t.revision,
        p_action: action,
        p_data: data,
      }),
    opAct = (action: string, data: any) =>
      void run("commercial_op_act", {
        p_code: code,
        p_revision: ctx.revision,
        p_action: action,
        p_data: data,
      });
  return (
    <article className="co-detail" aria-label="Oportunidade selecionada">
      <header>
        <b className="co-company">{ctx.company}</b>
        <h2>{ctx.customer}</h2>
        <p>
          {ctx.service} · {money(ctx.value)}
        </p>
        <span className="co-pill">{states[ctx.state]}</span>
      </header>
      {error && (
        <p role="alert" className="co-error">
          {error}
        </p>
      )}
      {uncertain && (
        <div role="alert" className="co-error">
          A confirmação não chegou. Recupere o resultado com a mesma chave.
          <button disabled={busy} onClick={() => void run("", {}, true)}>
            Confirmar resultado anterior
          </button>
        </div>
      )}
      <div className="co-detail-body">
        <div className="co-contact">
          <b>
            {ctx.contact_allowed
              ? "Contato operacional autorizado"
              : "Contato não autorizado"}
          </b>
          <span>{ctx.contact || "Nenhum contato liberado"}</span>
          <small>
            {ctx.can_operate
              ? "Autonomia de follow-up autorizada"
              : "Execução exige autorização da empresa"}{" "}
            · {ctx.timezone}
          </small>
        </div>
        <div className="co-links">
          {ctx.ticket ? (
            <>
              <Link to={ticketPath(ctx.ticket, companyOrg)}>
                Abrir atendimento e orçamento ↗
              </Link>
              <Link
                to={ticketPath(ctx.ticket, companyOrg, { panel: "replies" })}
              >
                Respostas rápidas autorizadas ↗
              </Link>
            </>
          ) : ctx.request_state !== "draft" ? (
            <button
              disabled={blocked}
              onClick={() => {
                setBusy(true);
                void rpc("central_open_request", { p_request: ctx.request })
                  .then(() => load())
                  .catch((e) => setError(errorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Preparar atendimento vinculado
            </button>
          ) : (
            <p>
              Solicitação em rascunho. O atendimento será vinculado quando o
              consumidor enviar o pedido.
            </p>
          )}
        </div>
        <section className="co-next">
          <span className="co-eyebrow">PRÓXIMO PASSO</span>
          <h3>{t ? kinds[t.kind] : "Nenhuma tarefa ativa"}</h3>
          {t && (
            <>
              <p>
                {date(t.due_at, ctx.timezone)} · Tentativa {t.attempt} de{" "}
                {t.max_attempts}
              </p>
              <p>
                {taskStates[t.state]} · {t.assignee_name || "Sem responsável"}
              </p>
              <div className="co-actions">
                <button
                  className="primary"
                  disabled={
                    blocked ||
                    !can ||
                    Boolean(t.assignee_id && t.assignee_eligible)
                  }
                  onClick={() => act("claim")}
                >
                  Assumir tarefa
                </button>
                <button
                  disabled={
                    blocked || !can || !own || t.state === "in_progress"
                  }
                  onClick={() => act("start")}
                >
                  Iniciar tentativa
                </button>
              </div>
              <small>
                Horário e consentimento são revalidados a cada operação.
                Tentativas contam ao registrar resultado.
              </small>
            </>
          )}
        </section>
        {t && (
          <section>
            <h3>Registrar resultado real</h3>
            <label>
              Resultado
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                {Object.entries(outcomes).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observação interna curta
              <textarea
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Somente o contexto necessário; nunca enviado ao consumidor."
              />
            </label>
            {outcome === "return_later" && (
              <label>
                Retornar em (horário deste dispositivo)
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
            )}
            <button
              className="primary"
              disabled={
                blocked ||
                !can ||
                !own ||
                t.state !== "in_progress" ||
                (outcome === "other" && note.trim().length < 2) ||
                (outcome === "return_later" && !due)
              }
              onClick={() =>
                act("result", {
                  outcome,
                  note,
                  next_due_at:
                    outcome === "return_later"
                      ? new Date(due).toISOString()
                      : null,
                })
              }
            >
              Salvar resultado
            </button>
            <p className="co-caption">
              Aprovação e agendamento são registrados nos respectivos fluxos da
              Central. Conversão exige evento real de{" "}
              {ctx.criterion === "approval"
                ? "aprovação"
                : "agendamento confirmado"}
              ; não é receita.
            </p>
          </section>
        )}
        {can && (
          <details>
            <summary>Reagendar, transferir ou encerrar</summary>
            <label>
              Novo retorno (horário deste dispositivo)
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <button
              disabled={blocked || !due || Boolean(t && !own)}
              onClick={() =>
                t
                  ? act("reschedule", { due_at: new Date(due).toISOString() })
                  : opAct("schedule", { due_at: new Date(due).toISOString() })
              }
            >
              Programar retorno
            </button>
            {t && (
              <>
                <label>
                  Transferir para
                  <select
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  >
                    <option value="">Atendente autorizado</option>
                    {ctx.recipients
                      .filter((x: any) => x.id !== t.assignee_id)
                      .map((x: any) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  disabled={blocked || !own || !recipient}
                  onClick={() => act("transfer", { user_id: recipient })}
                >
                  Transferir tarefa
                </button>
                <label>
                  Prioridade
                  <select
                    value={t.priority}
                    disabled={blocked || !own}
                    onChange={(e) =>
                      act("priority", { priority: Number(e.target.value) })
                    }
                  >
                    <option value="0">Baixa</option>
                    <option value="1">Normal</option>
                    <option value="2">Urgente</option>
                  </select>
                </label>
                <button
                  disabled={blocked || !own}
                  onClick={() => {
                    if (confirm("Encerrar os retornos desta oportunidade?"))
                      act("cancel");
                  }}
                >
                  Encerrar recuperação
                </button>
              </>
            )}
            <label>
              Motivo da perda
              <select value={loss} onChange={(e) => setLoss(e.target.value)}>
                <option value="">Escolha o motivo</option>
                {ctx.loss_reasons.map((v: string) => (
                  <option key={v} value={v}>
                    {reasons[v] || v}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={blocked || !loss || Boolean(t && !own)}
              onClick={() => {
                if (confirm("Registrar perda e cancelar retornos?"))
                  opAct("lose", { reason: loss });
              }}
            >
              Registrar perda
            </button>
          </details>
        )}
        {ctx.loss_reason && (
          <p>
            Motivo: {reasons[ctx.loss_reason] || ctx.loss_reason}. Novo
            interesse gera outra oportunidade e preserva esta.
          </p>
        )}
        <details>
          <summary>Histórico de tentativas · {ctx.attempts.length}</summary>
          {ctx.attempts.map((x: any, i: number) => (
            <div className="co-history" key={i}>
              <b>{outcomes[x.outcome] || x.outcome}</b>
              <small>
                {date(x.at, ctx.timezone)} · {x.actor}
              </small>
              <p>{x.note}</p>
            </div>
          ))}
        </details>
        <details open>
          <summary>Timeline comercial · eventos reais</summary>
          {ctx.events.map((x: any, i: number) => (
            <div className="co-event" key={i}>
              <i />
              <div>
                <b>{events[x.event] || x.event}</b>
                <small>
                  {date(x.at, ctx.timezone)} · {x.actor || "Regra operacional"}
                </small>
                {x.reason && x.event !== "transferred" && (
                  <small>
                    {reasons[x.reason] ||
                      outcomes[x.reason] ||
                      kinds[x.reason] ||
                      x.reason}
                  </small>
                )}
              </div>
            </div>
          ))}
        </details>
        <details>
          <summary>Regra aplicada e tarefas anteriores</summary>
          {ctx.tasks.map((x: any) => (
            <div className="co-history" key={x.id}>
              <b>
                {kinds[x.kind]} · {taskStates[x.state]}
              </b>
              <p>
                Intervalo {x.rule_snapshot.interval_minutes} min · máximo{" "}
                {x.max_attempts} tentativas · origem{" "}
                {x.rule_snapshot.interval_source}
              </p>
              <small>
                {date(x.created_at, ctx.timezone)} ·{" "}
                {x.cancel_reason || x.result || "Pendente"}
              </small>
            </div>
          ))}
        </details>
      </div>
    </article>
  );
}
