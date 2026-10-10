import { Recurrences } from "./Recurrences";
import { useSearchParams } from "react-router-dom";
import { useFinancialCommand } from "./useFinancialCommand";
import { useEffect, useState, type FormEvent } from "react";
import { rpc, errorMessage } from "../api";
import { usePermissions } from "../permissions/Permissions";
import { simulate } from "./calculators";
import "./finance.css";
export const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(n / 100);
const status: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Recebido",
  overdue: "Vencida",
  cancelled: "Cancelada",
};
const methods: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  transfer: "Transferência",
  other: "Outro",
};
const key = () => crypto.randomUUID();
const amount = (s: FormDataEntryValue | null) =>
  Math.round(Number(String(s || "0").replace(",", ".")) * 100);
const today = (timezone = "America/Recife") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function Method() {
  return (
    <label className="field">
      Forma de pagamento
      <select name="method">
        {Object.entries(methods).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
export function PeriodFilters({
  from,
  to,
  setFrom,
  setTo,
  timezone = "America/Recife",
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  timezone?: string;
}) {
  function preset(n: number) {
    const end = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const d = new Date(end + "T12:00:00Z");
    if (n === 0) d.setUTCDate(1);
    else d.setUTCDate(d.getUTCDate() - n + 1);
    setFrom(d.toISOString().slice(0, 10));
    setTo(end);
  }
  return (
    <div className="finance-filters">
      <div className="button-row">
        {[
          [1, "Hoje"],
          [7, "7 dias"],
          [30, "30 dias"],
          [0, "Este mês"],
        ].map(([n, l]) => (
          <button key={n} type="button" onClick={() => preset(Number(n))}>
            {l}
          </button>
        ))}
      </div>
      <label className="field">
        De
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label className="field">
        Até
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <small>
        Datas no fuso {timezone}. Intervalo personalizado de até 366 dias.
      </small>
    </div>
  );
}
export function FinancialMetrics({ data }: { data: any }) {
  return (
    <>
      <div className="finance-metrics">
        {[
          ["quoted_cents", "Orçado"],
          ["approved_cents", "Aprovado"],
          ["performed_cents", "Realizado"],
          ["received_cents", "Recebido"],
          ["expenses_cents", "Despesas pagas"],
          ["forecast_expenses_cents", "Despesas previstas"],
          ["result_cents", "Resultado realizado"],
          ["receivable_cents", "Saldo a receber agora"],
          ["overdue_cents", "Saldo vencido agora"],
          ["average_receipt_cents", "Valor médio por recebimento"],
        ]
          .filter(([k]) => Object.hasOwn(data, k))
          .map(([k, l]) => (
            <article key={k} className="card">
              <span>{l}</span>
              <strong>{money(data[k])}</strong>
            </article>
          ))}
      </div>
      <p className="muted">
        Recebido considera registros de entrada e estornos. Resultado =
        recebimentos líquidos de estornos − despesas registradas; não é lucro
        contábil. Saldos a receber refletem a posição atual.
      </p>
    </>
  );
}
export function AccountDetail({
  org,
  id,
  onChanged,
}: {
  org: string;
  id: string;
  onChanged?: () => void;
}) {
  const command = useFinancialCommand();
  const { can } = usePermissions();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [references, setReferences] = useState<any>(null);
  useEffect(() => {
    if (can("finance.accounts.manage"))
      void rpc("financial_reference_options", { p_org: org })
        .then(setReferences)
        .catch(() => {});
  }, [org]);
  async function load() {
    setData(await rpc("financial_account", { p_org: org, p_id: id }));
  }
  useEffect(() => {
    let alive = true;
    rpc<any>("financial_account", { p_org: org, p_id: id })
      .then((x) => {
        if (alive) setData(x);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
      setData(null);
    };
  }, [org, id]);
  async function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await command("financial_receipt_record", {
        p_org: org,
        p_account: id,
        p_amount: amount(f.get("amount")),
        p_date: f.get("date"),
        p_method: f.get("method"),
        p_note: f.get("note"),
        p_key: key(),
      });
      form.reset();
      await load();
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reverse(receipt: string) {
    setBusy(true);
    setError("");
    try {
      await command("financial_receipt_reverse", {
        p_org: org,
        p_receipt: receipt,
        p_reason: reason,
        p_key: key(),
      });
      setReason("");
      await load();
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card finance-detail">
      <h2>Detalhes da cobrança</h2>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data && (
        <>
          <h3>{data.account.description}</h3>
          <p>
            {data.account.customer_name || "Cliente não vinculado"} ·{" "}
            {status[data.account.status]}
          </p>
          <div className="finance-values">
            <span>
              Total<strong>{money(data.account.total_cents)}</strong>
            </span>
            <span>
              Recebido<strong>{money(data.account.received_cents)}</strong>
            </span>
            <span>
              Pendente<strong>{money(data.account.balance_cents)}</strong>
            </span>
          </div>
          {data.account.notes && <p>{data.account.notes}</p>}
          {can("finance.accounts.manage") &&
            data.account.status !== "cancelled" && (
              <details>
                <summary>Gerenciar conta</summary>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setBusy(true);
                    try {
                      await command("financial_account_save", {
                        p_org: org,
                        p_id: id,
                        p_revision: data.account.revision,
                        p_data: {
                          description: f.get("description"),
                          total_cents: amount(f.get("total")),
                          due_date: f.get("due") || null,
                          notes: f.get("notes") || "",
                          ...(references?.assignees
                            ? { assigned_to: f.get("assigned") || null }
                            : {}),
                        },
                        p_key: key(),
                      });
                      await load();
                      onChanged?.();
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <fieldset className="finance-form" disabled={busy}>
                    <label className="field">
                      Descrição da conta
                      <input
                        name="description"
                        defaultValue={data.account.description}
                        minLength={2}
                        maxLength={300}
                        required
                      />
                    </label>
                    <label className="field">
                      Total da conta (R$)
                      <input
                        name="total"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={data.account.total_cents / 100}
                        readOnly={data.account.origin === "approved_quote"}
                        required
                      />
                    </label>
                    <label className="field">
                      Vencimento da conta
                      <input
                        name="due"
                        type="date"
                        defaultValue={data.account.due_date || ""}
                      />
                    </label>
                    <label className="field">
                      Observações da conta
                      <input
                        name="notes"
                        defaultValue={data.account.notes}
                        maxLength={2000}
                      />
                    </label>
                    {references?.assignees && (
                      <label className="field">
                        Responsável pela cobrança
                        <select
                          name="assigned"
                          defaultValue={data.account.assigned_to || ""}
                        >
                          <option value="">Sem atribuição individual</option>
                          {references.assignees.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button>Salvar conta</button>
                  </fieldset>
                </form>
                {data.account.received_cents === 0 && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        await command("financial_account_save", {
                          p_org: org,
                          p_id: id,
                          p_revision: data.account.revision,
                          p_data: {
                            cancel: true,
                            reason: new FormData(e.currentTarget).get("reason"),
                          },
                          p_key: key(),
                        });
                        await load();
                        onChanged?.();
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label className="field">
                      Motivo do cancelamento da conta
                      <input
                        name="reason"
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                    <button disabled={busy}>Cancelar conta a receber</button>
                  </form>
                )}
              </details>
            )}
          {data.can_record &&
            data.account.balance_cents > 0 &&
            data.account.status !== "cancelled" && (
              <form onSubmit={record}>
                <h3>Registrar recebimento</h3>
                <p>
                  Registre somente um valor efetivamente recebido pela empresa.
                </p>
                <fieldset className="finance-form" disabled={busy}>
                  <label className="field">
                    Valor recebido (R$)
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max={data.account.balance_cents / 100}
                      step="0.01"
                      required
                    />
                  </label>
                  <label className="field">
                    Data do recebimento
                    <input
                      name="date"
                      type="date"
                      defaultValue={today()}
                      max={today()}
                      required
                    />
                  </label>
                  <Method />
                  <label className="field">
                    Observação
                    <input name="note" maxLength={1000} />
                  </label>
                  <button className="primary">
                    Confirmar registro de recebimento
                  </button>
                </fieldset>
              </form>
            )}
          {data.receipts && (
            <>
              <h3>Histórico de recebimentos</h3>
              {data.can_reverse && (
                <label className="field">
                  Motivo do estorno (obrigatório)
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={10}
                    maxLength={1000}
                    placeholder="Descreva a correção necessária"
                  />
                </label>
              )}
              {!data.receipts.length && <p>Nenhum recebimento registrado.</p>}
              {data.receipts.map((r: any) => (
                <div className="list-row" key={r.id}>
                  <div>
                    <strong>
                      {r.kind === "reversal" ? "Estorno" : "Recebimento"} ·{" "}
                      {money(
                        r.kind === "reversal"
                          ? -r.amount_cents
                          : r.amount_cents,
                      )}
                    </strong>
                    <p>
                      {r.effective_date} · {methods[r.method]} · {r.actor_name}
                    </p>
                    {r.note && <p>{r.note}</p>}
                  </div>
                  {data.can_reverse &&
                    r.kind === "receipt" &&
                    !data.receipts.some((v: any) => v.original_id === r.id) && (
                      <button
                        disabled={busy || reason.trim().length < 10}
                        onClick={() => void reverse(r.id)}
                      >
                        Estornar recebimento
                      </button>
                    )}
                </div>
              ))}
            </>
          )}
          {data.history && (
            <details>
              <summary>Histórico da cobrança</summary>
              {data.history.map((h: any) => (
                <p key={h.id}>
                  {new Date(h.created_at).toLocaleString("pt-BR")} · {h.reason}
                </p>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
export function Finance({ org }: { org: string }) {
  const [params] = useSearchParams();
  const command = useFinancialCommand();
  const { can, data: permissions } = usePermissions();
  const tabs = [
    ["overview", "Visão geral", "analytics.financial"],
    ["accounts", "Contas a receber", "finance.accounts.read"],
    ["receipts", "Recebimentos", "finance.receipts.summary"],
    ["expenses", "Despesas", "finance.expenses.read"],
    ["cash", "Caixa", "finance.cash.read"],
    ["calculators", "Calculadoras", "finance.calculators"],
  ].filter(
    (x) =>
      can(x[2]) ||
      (x[0] === "overview" &&
        [
          "finance.cash.read",
          "finance.result.read",
          "finance.receipts.summary",
        ].some(can)) ||
      (x[0] === "expenses" &&
        [
          "finance.expenses.record",
          "finance.recurring.create",
          "finance.recurring.manage",
          "finance.forecast.read",
          "finance.expenses.pay",
        ].some(can)) ||
      (x[0] === "accounts" && can("finance.accounts.manage")),
  );
  const [tab, setTab] = useState(
      params.has("conta") ? "accounts" : tabs[0]?.[0] || "",
    ),
    [from, setFrom] = useState(today(permissions?.timezone).slice(0, 8) + "01"),
    [to, setTo] = useState(today(permissions?.timezone)),
    [data, setData] = useState<any>(null),
    [selected, setSelected] = useState(params.get("conta") || ""),
    [references, setReferences] = useState<any>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [round, setRound] = useState(0);
  const reload = () => setRound((n) => n + 1);
  useEffect(() => {
    let live = true;
    if (can("finance.accounts.manage"))
      void rpc("financial_reference_options", { p_org: org })
        .then((d) => {
          if (live) setReferences(d);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [org, permissions]);
  useEffect(() => {
    if (!tabs.some((t) => t[0] === tab)) setTab(tabs[0]?.[0] || "");
  }, [JSON.stringify(tabs), tab]);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    if (tab === "calculators" || !tab) return;
    if (tab === "expenses" && !can("finance.expenses.read")) {
      setData({ expenses: [], categories: [] });
      return;
    }
    const name =
      tab === "accounts"
        ? "financial_accounts"
        : tab === "receipts"
          ? "financial_receipts"
          : tab === "expenses"
            ? "financial_expenses"
            : "financial_summary";
    const args =
      tab === "accounts"
        ? {
            p_org: org,
            p_status: filter || null,
            p_search: search,
            p_offset: offset,
          }
        : { p_org: org, p_from: from, p_to: to };
    rpc(name, args)
      .then((x) => {
        if (alive) setData(x);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [org, tab, from, to, filter, search, offset, round]);
  async function create(e: FormEvent<HTMLFormElement>, expense = false) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result = await command<any>(
        expense ? "financial_expense_save" : "financial_account_save",
        expense
          ? {
              p_org: org,
              p_data: {
                description: f.get("description"),
                amount_cents: amount(f.get("amount")),
                date: f.get("date"),
                category: f.get("category"),
                method: f.get("method"),
                note: f.get("notes"),
              },
              p_key: key(),
            }
          : {
              p_org: org,
              p_id: null,
              p_revision: 0,
              p_data: {
                description: f.get("description"),
                total_cents: amount(f.get("amount")),
                due_date: f.get("date") || null,
                notes: f.get("notes") || "",
                customer_id: f.get("customer") || null,
                service_id: f.get("service") || null,
                appointment_id: f.get("appointment") || null,
                assigned_to: f.get("assigned") || null,
              },
              p_key: key(),
            },
      );
      form.reset();
      if (!expense) setSelected(result.id);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancelExpense(id: string, reason: string) {
    setBusy(true);
    try {
      await command("financial_expense_cancel", {
        p_org: org,
        p_id: id,
        p_reason: reason,
        p_key: key(),
      });
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="finance-module">
      <p className="eyebrow">OPERAÇÃO DA EMPRESA</p>
      <h1>Financeiro</h1>
      <p>
        Contas, entradas e despesas da empresa. Sua assinatura SYZIA fica em
        Plano e assinatura.
      </p>
      <nav className="company-tabs" aria-label="Financeiro">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            className={tab === v ? "selected" : ""}
            onClick={() => {
              setTab(v);
              setSelected("");
              setOffset(0);
            }}
          >
            {l}
          </button>
        ))}
      </nav>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!["accounts", "calculators"].includes(tab) && (
        <PeriodFilters
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
          timezone={data?.period?.timezone || permissions?.timezone}
        />
      )}
      {["overview", "cash"].includes(tab) && data && (
        <FinancialMetrics data={data} />
      )}
      {tab === "accounts" && (
        <>
          <div className="finance-filters">
            <label className="field">
              Buscar cobrança
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <label className="field">
              Situação
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Todas</option>
                {Object.entries(status).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {can("finance.accounts.manage") && (
            <details className="card">
              <summary>Nova conta a receber</summary>
              <form onSubmit={(e) => void create(e)}>
                <fieldset disabled={busy} className="finance-form">
                  <label className="field">
                    Descrição
                    <input
                      name="description"
                      minLength={2}
                      maxLength={300}
                      required
                    />
                  </label>
                  {references?.assignees?.length > 0 && (
                    <label className="field">
                      Responsável pela cobrança
                      <select name="assigned">
                        <option value="">Sem atribuição individual</option>
                        {references.assignees.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {references?.customers?.length > 0 && (
                    <label className="field">
                      Cliente vinculado
                      <select name="customer">
                        <option value="">Sem vínculo</option>
                        {references.customers.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {references?.services?.length > 0 && (
                    <label className="field">
                      Serviço vinculado
                      <select name="service">
                        <option value="">Sem vínculo</option>
                        {references.services.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {references?.appointments?.length > 0 && (
                    <label className="field">
                      Agendamento relacionado
                      <select name="appointment">
                        <option value="">Sem vínculo</option>
                        {references.appointments.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.customer} ·{" "}
                            {new Date(c.starts_at).toLocaleDateString("pt-BR")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    Total (R$)
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max="1000000000"
                      step="0.01"
                      required
                    />
                  </label>
                  <label className="field">
                    Vencimento
                    <input name="date" type="date" />
                  </label>
                  <label className="field">
                    Observações
                    <textarea name="notes" maxLength={2000} />
                  </label>
                  <button className="primary">Criar conta a receber</button>
                </fieldset>
              </form>
            </details>
          )}
          <div className="finance-account-grid">
            <section className="card">
              <h2>Contas a receber</h2>
              {data?.accounts?.length === 0 && (
                <p>Nenhuma cobrança neste filtro.</p>
              )}
              {data?.accounts?.map((a: any) => (
                <button
                  className="finance-account"
                  key={a.id}
                  onClick={() => setSelected(a.id)}
                  aria-pressed={selected === a.id}
                >
                  <strong>{a.description}</strong>
                  <span>
                    {a.customer_name || "Cliente não vinculado"} ·{" "}
                    {status[a.status]}
                  </span>
                  <span>
                    Pendente {money(a.balance_cents)} de {money(a.total_cents)}
                  </span>
                </button>
              ))}
              <div className="button-row">
                {offset > 0 && (
                  <button onClick={() => setOffset(Math.max(0, offset - 50))}>
                    Anterior
                  </button>
                )}
                {data?.next_offset && (
                  <button onClick={() => setOffset(data.next_offset)}>
                    Próxima
                  </button>
                )}
              </div>
            </section>
            {selected && (
              <AccountDetail
                key={selected}
                org={org}
                id={selected}
                onChanged={reload}
              />
            )}
          </div>
        </>
      )}
      {tab === "receipts" && (
        <section className="card">
          <h2>Recebimentos do período</h2>
          {data?.length === 0 && <p>Nenhum lançamento neste período.</p>}
          {Array.isArray(data) &&
            data.map((r: any) => (
              <div className="list-row" key={r.id}>
                <div>
                  <strong>{r.description}</strong>
                  <p>
                    {r.effective_date} · {methods[r.method]} ·{" "}
                    {r.kind === "reversal" ? "Estorno" : "Recebimento"}
                  </p>
                </div>
                <strong>
                  {money(
                    r.kind === "reversal" ? -r.amount_cents : r.amount_cents,
                  )}
                </strong>
              </div>
            ))}
        </section>
      )}
      {tab === "expenses" && (
        <>
          <Recurrences org={org} from={from} to={to} onChange={reload} />
          <section className="card">
            <h2>Despesas</h2>
            {can("finance.expenses.record") && (
              <details>
                <summary>Registrar despesa única paga</summary>
                <form onSubmit={(e) => void create(e, true)}>
                  <fieldset disabled={busy} className="finance-form">
                    <label className="field">
                      Descrição
                      <input
                        name="description"
                        minLength={2}
                        maxLength={300}
                        required
                      />
                    </label>
                    <label className="field">
                      Valor pago (R$)
                      <input
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                      />
                    </label>
                    <label className="field">
                      Data
                      <input
                        name="date"
                        type="date"
                        defaultValue={today()}
                        max={today()}
                        required
                      />
                    </label>
                    <label className="field">
                      Categoria
                      <input
                        name="category"
                        list="expense-categories"
                        maxLength={100}
                        required
                      />
                      <datalist id="expense-categories">
                        {data?.categories
                          ?.filter((c: any) => c.active)
                          .map((c: any) => (
                            <option key={c.id} value={c.name} />
                          ))}
                      </datalist>
                    </label>
                    <Method />
                    <label className="field">
                      Observações
                      <input name="notes" maxLength={2000} />
                    </label>
                    <button className="primary">Registrar despesa</button>
                  </fieldset>
                </form>
              </details>
            )}
            {can("finance.expenses.manage") && (
              <details>
                <summary>Gerenciar categorias de despesas</summary>
                {data?.categories?.map((c: any) => (
                  <form
                    key={c.id}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      try {
                        await command("financial_expense_category_save", {
                          p_org: org,
                          p_id: c.id,
                          p_name: f.get("name"),
                          p_active: f.has("active"),
                          p_delete: false,
                          p_key: key(),
                        });
                        reload();
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  >
                    <fieldset className="finance-form" disabled={busy}>
                      <label className="field">
                        Nome da categoria
                        <input
                          name="name"
                          defaultValue={c.name}
                          maxLength={120}
                          required
                        />
                      </label>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={c.active}
                        />
                        Ativa
                      </label>
                      <button>Salvar categoria</button>
                    </fieldset>
                  </form>
                ))}
              </details>
            )}
            {data?.expenses?.length === 0 && <p>Nenhuma despesa no período.</p>}
            {data?.expenses?.map((e: any) => (
              <div className="list-row" key={e.id}>
                <div>
                  <strong>
                    {e.description} · {money(e.amount_cents)}
                  </strong>
                  <p>
                    {e.effective_date} · {e.category} ·{" "}
                    {e.cancelled_at ? "Cancelada" : methods[e.method]}
                  </p>
                </div>
                {!e.cancelled_at && can("finance.expenses.manage") && (
                  <form
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      void cancelExpense(
                        e.id,
                        String(new FormData(ev.currentTarget).get("reason")),
                      );
                    }}
                  >
                    <label className="field">
                      Motivo do cancelamento
                      <input
                        name="reason"
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                    <button disabled={busy}>Cancelar despesa</button>
                  </form>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "calculators" && <Calculators />}
    </div>
  );
}
export function Calculators() {
  const [kind, setKind] = useState("price"),
    [costs, setCosts] = useState({
      materials: 0,
      hours: 0,
      hourly: 0,
      travel: 0,
      other: 0,
    }),
    [values, setValues] = useState({
      cost: 0,
      price: 0,
      percent: 0,
      goal: 0,
      days: 22,
    });
  let result = null,
    error = "";
  try {
    result = simulate(kind, {
      ...values,
      cost:
        costs.materials +
        costs.hours * costs.hourly +
        costs.travel +
        costs.other,
    });
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section className="card">
      <h2>Simule uma decisão</h2>
      <p>Estas calculadoras não alteram preços, orçamentos ou lançamentos.</p>
      <label className="field">
        Simulação
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="price">Preço com margem desejada</option>
          <option value="margin">Margem sobre a venda</option>
          <option value="discount">Desconto</option>
          <option value="goal">Meta de atendimentos</option>
        </select>
      </label>
      <div className="finance-form">
        {[
          [
            "price",
            "Preço ou ticket médio (R$)",
            ["margin", "discount", "goal"],
          ],
          [
            "percent",
            kind === "discount" ? "Desconto (%)" : "Margem desejada (%)",
            ["price", "discount"],
          ],
          ["goal", "Meta do período (R$)", ["goal"]],
          ["days", "Dias de trabalho", ["goal"]],
        ]
          .filter((x) => (x[2] as string[]).includes(kind))
          .map(([k, l]) => (
            <label className="field" key={String(k)}>
              {String(l)}
              <input
                type="number"
                min="0"
                step={k === "days" ? "1" : "0.01"}
                value={values[k as keyof typeof values]}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [String(k)]: Number(e.target.value),
                  }))
                }
              />
            </label>
          ))}
      </div>
      {kind !== "goal" && (
        <fieldset className="finance-form">
          <legend>Custos estimados</legend>
          {[
            ["materials", "Materiais (R$)"],
            ["hours", "Horas de trabalho"],
            ["hourly", "Custo da hora (R$)"],
            ["travel", "Deslocamento (R$)"],
            ["other", "Outros custos (R$)"],
          ].map(([k, l]) => (
            <label className="field" key={k}>
              {l}
              <input
                type="number"
                min="0"
                step="0.01"
                value={costs[k as keyof typeof costs]}
                onChange={(e) =>
                  setCosts((c) => ({ ...c, [k]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
          <p>
            Custo total:{" "}
            {money(
              Math.round(
                (costs.materials +
                  costs.hours * costs.hourly +
                  costs.travel +
                  costs.other) *
                  100,
              ),
            )}
          </p>
        </fieldset>
      )}
      {error ? (
        <p role="status">{error}</p>
      ) : (
        result && (
          <output className="finance-simulation">
            <span>{result.label}</span>
            <strong>
              {result.unit === "money"
                ? money(Math.round(result.value * 100))
                : result.value.toLocaleString("pt-BR", {
                    maximumFractionDigits: 2,
                  }) + (result.unit === "percent" ? "%" : "")}
            </strong>
            {"margin" in result && result.margin != null && (
              <span>
                Margem estimada:{" "}
                {result.margin.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })}
                %
              </span>
            )}
            {"perDay" in result && (
              <span>Aproximadamente {result.perDay} por dia de trabalho.</span>
            )}
          </output>
        )
      )}
      <p className="muted">
        Margem = (preço − custo) ÷ preço. Inclua nos custos os valores
        relevantes para sua simulação.
      </p>
    </section>
  );
}
