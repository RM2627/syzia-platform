import { useEffect, useState } from "react";
import { rpc, errorMessage } from "../api";
import { usePermissions } from "../permissions/Permissions";
import { useFinancialCommand } from "./useFinancialCommand";
import { money } from "./Finance";
const dateNow = (timezone = "America/Recife") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const frequencies: Record<string, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};
export function Recurrences({
  org,
  from,
  to,
  onChange,
}: {
  org: string;
  from: string;
  to: string;
  onChange: () => void;
}) {
  const { can, data: permissions } = usePermissions(),
    command = useFinancialCommand();
  const [data, setData] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [round, setRound] = useState(0);
  const reload = () => {
    setRound((n) => n + 1);
    onChange();
  };
  useEffect(() => {
    if (can("finance.forecast.read"))
      void rpc("financial_forecast", { p_org: org, p_from: from, p_to: to })
        .then(setData)
        .catch((e) => setError(errorMessage(e)));
  }, [org, from, to, round, can("finance.forecast.read")]);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      await command("financial_recurrence_save", {
        p_org: org,
        p_id: editing?.id || null,
        p_revision: editing?.revision || 0,
        p_key: crypto.randomUUID(),
        p_data: {
          description: f.get("description"),
          category: f.get("category"),
          amount_cents: Math.round(Number(f.get("amount")) * 100),
          frequency: editing?.frequency || f.get("frequency"),
          starts_on: editing?.starts_on || f.get("starts_on"),
          ends_on: f.get("ends_on") || null,
          note: f.get("note") || "",
          active: true,
        },
      });
      setShow(false);
      setEditing(null);
      setNotice(
        "Recorrência salva. As ocorrências são previstas até a confirmação do pagamento.",
      );
    });
  }
  return (
    <section className="card">
      <div className="page-heading">
        <div>
          <h2>Despesas recorrentes e previstas</h2>
          <p>
            Organize compromissos futuros. Previsão não altera o resultado
            realizado.
          </p>
        </div>
        {can("finance.recurring.create") && (
          <button
            onClick={() => {
              setEditing(null);
              setShow(!show);
            }}
          >
            Nova recorrência
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {show && (
        <form onSubmit={save}>
          <fieldset className="finance-form" disabled={busy}>
            <legend>
              {editing ? "Editar próximas ocorrências" : "Despesa recorrente"}
            </legend>
            <label>
              Descrição
              <input
                name="description"
                required
                minLength={2}
                maxLength={300}
                defaultValue={editing?.description}
              />
            </label>
            <label>
              Categoria
              <input
                name="category"
                maxLength={120}
                defaultValue={editing?.category}
              />
            </label>
            <label>
              Valor por ocorrência (R$)
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={editing ? editing.amount_cents / 100 : ""}
              />
            </label>
            <label>
              Frequência
              <select
                name="frequency"
                defaultValue={editing?.frequency || "monthly"}
                disabled={Boolean(editing)}
              >
                {Object.entries(frequencies).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Primeiro vencimento
              <input
                name="starts_on"
                type="date"
                required
                defaultValue={
                  editing?.starts_on || dateNow(permissions?.timezone)
                }
                disabled={Boolean(editing)}
              />
            </label>
            <label>
              Fim opcional
              <input
                name="ends_on"
                type="date"
                defaultValue={editing?.ends_on || ""}
              />
            </label>
            <label>
              Observação
              <textarea
                name="note"
                maxLength={1000}
                defaultValue={editing?.note}
              />
            </label>
            <p>
              O dia do primeiro vencimento define o ciclo. Em meses menores,
              usa-se o último dia. Pagamentos anteriores permanecem intactos.
              Para mudar frequência ou data inicial, encerre esta recorrência e
              crie outra.
            </p>
            <button className="primary">Salvar recorrência</button>
            <button type="button" onClick={() => setShow(false)}>
              Fechar
            </button>
          </fieldset>
        </form>
      )}
      {data?.recurrences?.length > 0 && (
        <details>
          <summary>Recorrências cadastradas</summary>
          {data.recurrences.map((r: any) => (
            <article className="list-row" key={r.id}>
              <div>
                <strong>{r.description}</strong>
                <p>
                  {frequencies[r.frequency]} · {money(r.amount_cents)} ·{" "}
                  {r.active ? "Ativa" : "Encerrada"}
                </p>
              </div>
              {r.active && can("finance.recurring.manage") && (
                <div className="button-row">
                  <button
                    onClick={() => {
                      setEditing(r);
                      setShow(true);
                    }}
                  >
                    Editar futuras
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await command("financial_recurrence_save", {
                          p_org: org,
                          p_id: r.id,
                          p_revision: r.revision,
                          p_key: crypto.randomUUID(),
                          p_data: {
                            description: r.description,
                            category: r.category,
                            amount_cents: r.amount_cents,
                            frequency: r.frequency,
                            starts_on: r.starts_on,
                            ends_on: r.ends_on,
                            note: r.note,
                            active: false,
                          },
                        });
                        setNotice(
                          "Recorrência encerrada. Histórico preservado.",
                        );
                      })
                    }
                  >
                    Encerrar recorrência
                  </button>
                </div>
              )}
            </article>
          ))}
        </details>
      )}
      {data?.occurrences?.length === 0 && (
        <p>Nenhuma ocorrência prevista neste período.</p>
      )}
      {data?.occurrences?.map((o: any) => (
        <article className="card" key={o.id}>
          <strong>
            {o.description} · {money(o.amount_cents)}
          </strong>
          <p>
            Vencimento: {o.due_date} ·{" "}
            {o.payment_cancelled
              ? "Pagamento cancelado · histórico preservado"
              : o.state === "paid"
                ? "Paga"
                : o.state === "cancelled"
                  ? "Cancelada"
                  : "Prevista / pendente"}
          </p>
          {o.state === "pending" && can("finance.expenses.pay") && (
            <details>
              <summary>Confirmar pagamento</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await command("financial_occurrence_pay", {
                      p_org: org,
                      p_id: o.id,
                      p_date: f.get("date"),
                      p_method: f.get("method"),
                      p_key: crypto.randomUUID(),
                    });
                    setNotice("Pagamento registrado no financeiro.");
                  });
                }}
              >
                <label>
                  Data do pagamento
                  <input
                    name="date"
                    type="date"
                    required
                    max={dateNow(permissions?.timezone)}
                    defaultValue={dateNow(permissions?.timezone)}
                  />
                </label>
                <label>
                  Forma de pagamento
                  <select name="method">
                    <option value="pix">Pix</option>
                    <option value="cash">Dinheiro</option>
                    <option value="debit">Débito</option>
                    <option value="credit">Crédito</option>
                    <option value="transfer">Transferência</option>
                    <option value="other">Outro</option>
                  </select>
                </label>
                <p>Confirme somente depois de o pagamento ocorrer.</p>
                <button disabled={busy}>Marcar como paga</button>
              </form>
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
