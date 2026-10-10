import { useEffect, useState } from "react";
import { rpc } from "../api";
import { message } from "./api";
export function InternalContext({
  code,
  onChange,
}: {
  code: string;
  onChange: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(),
    [form, setForm] = useState<any>({
      tags: [],
      preferred_time: "",
      operational_note: "",
      origin_context: "",
      referrer_customer_id: null,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const d = await rpc<any>("consumer_work_context", { p_code: code });
    setData(d);
    if (d.customer_context) {
      const { customer_id, ...f } = d.customer_context;
      setForm(f);
    } else
      setForm({
        tags: [],
        preferred_time: "",
        operational_note: "",
        origin_context: "",
        referrer_customer_id: null,
      });
  }
  useEffect(() => {
    load().catch((e) => setError(message(e)));
  }, [code]);
  return (
    <details>
      <summary>Contexto interno do cliente</summary>
      {error && (
        <div role="alert" className="c-error">
          {error}
        </div>
      )}
      {data && (
        <>
          <p>
            {data.request_count} solicitação(ões) nesta empresa · origem:{" "}
            {data.origin?.source || "não informada"}
          </p>
          <p>
            Próxima ação:{" "}
            {
              (
                {
                  review_request: "analisar solicitação",
                  await_consumer: "aguardar consumidor",
                  arrange_booking: "combinar agendamento",
                  review_history: "consultar histórico",
                } as Record<string, string>
              )[data.next_action]
            }
          </p>
          {data.request.state === "submitted" && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await rpc("consumer_mark_review", { p_code: code });
                  await load();
                  await onChange();
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Registrar início da análise
            </button>
          )}
          <label>
            Tags internas (separadas por vírgula)
            <input
              value={form.tags.join(", ")}
              maxLength={400}
              onChange={(e) =>
                setForm({
                  ...form,
                  tags: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          {[
            ["preferred_time", "Horário preferido", 160],
            ["operational_note", "Observação operacional", 2000],
            ["origin_context", "Origem / contexto interno", 600],
          ].map(([key, label, max]) => (
            <label key={String(key)}>
              {label}
              <textarea
                maxLength={Number(max)}
                value={form[String(key)]}
                onChange={(e) =>
                  setForm({ ...form, [String(key)]: e.target.value })
                }
              />
            </label>
          ))}
          <label>
            Indicação de outro cliente da mesma empresa
            <select
              value={form.referrer_customer_id || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  referrer_customer_id: e.target.value || null,
                })
              }
            >
              <option value="">Não registrado</option>
              {data.referrer_options.map((c: any) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await rpc("consumer_customer_context_save", {
                  p_code: code,
                  p_data: form,
                });
                await load();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar contexto interno
          </button>
          <p>
            Estas informações não são publicadas nem exibidas ao consumidor.
            Indicação não gera saldo ou recompensa.
          </p>
        </>
      )}
    </details>
  );
}
