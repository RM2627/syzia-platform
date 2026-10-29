import { duration } from "../scheduling/ExecutionSchedule";
import { useEffect, useRef, useState } from "react";
import { rpc, errorMessage } from "../api";
import { money, date } from "../consumer/api";
import { QuoteSummary } from "../consumer/QuoteSummary";
import "./quote-calculator.css";
type Item = {
  kind: string;
  code?: string;
  position?: number;
  name: string;
  quantity: number;
  unit_cents: number | null;
  duration_minutes: number;
  discount_cents: number;
  note: string;
};
export function QuoteCalculator({
  org,
  request,
  onSent,
}: {
  org: string;
  request: any;
  onSent: () => Promise<void>;
}) {
  const original = request.versions?.find((v: any) => v.kind === "estimate");
  const [items, setItems] = useState<Item[]>(
      () =>
        original?.items.map((i: any, n: number) => ({
          kind: "original",
          position: n,
          name: i.name,
          quantity: i.quantity,
          unit_cents: i.unit_cents,
          duration_minutes: i.duration_minutes ?? 0,
          discount_cents: 0,
          note: "",
        })) || [],
    ),
    [catalog, setCatalog] = useState<any>(),
    [choice, setChoice] = useState(""),
    [discountMode, setDiscountMode] = useState("none"),
    [discountValue, setDiscountValue] = useState(0),
    [explanation, setExplanation] = useState(""),
    [expires, setExpires] = useState(
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    ),
    [preview, setPreview] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const sendKey = useRef(crypto.randomUUID());
  useEffect(() => {
    void rpc("operations_quote_catalog", { p_org: org })
      .then(setCatalog)
      .catch((e) => setError(errorMessage(e)));
  }, [org]);
  const changed = () => {
    setPreview(undefined);
    sendKey.current = crypto.randomUUID();
    setNotice("");
  };
  function update(n: number, patch: Partial<Item>) {
    changed();
    setItems(items.map((i, k) => (k === n ? { ...i, ...patch } : i)));
  }
  const discount = {
    mode: discountMode,
    value:
      discountMode === "amount"
        ? Math.round(discountValue * 100)
        : discountValue,
  };
  const args = {
    p_org: org,
    p_code: request.code || request.public_code,
    p_items: items,
    p_discount: discount,
  };
  const subtotal = items.reduce(
      (n, i) => n + i.quantity * (i.unit_cents ?? 0),
      0,
    ),
    itemDiscount = items.reduce((n, i) => n + i.discount_cents, 0),
    globalDiscount =
      discountMode === "percent"
        ? Math.floor(((subtotal - itemDiscount) * discountValue) / 100)
        : discountMode === "amount"
          ? Math.round(discountValue * 100)
          : 0;
  const total = subtotal - itemDiscount - globalDiscount;
  const pricesReady =
    items.length > 0 &&
    items.every(
      (i) =>
        i.unit_cents !== null &&
        Number.isFinite(i.unit_cents) &&
        Number.isFinite(i.quantity) &&
        i.quantity > 0,
    );
  const durationByUnit = (item: Item) => {
    const policy = item.kind === "original"
      ? request.requested_items?.find((r: any) => r.priced_items?.[0]?.position === item.position)
      : item.kind === "service" ? catalog?.services?.find((s: any) => s.code === item.code) : undefined;
    return !policy?.quantity_enabled || !["fixed", "manual"].includes(policy.quantity_duration);
  };
  const totalMinutes = items.reduce(
    (n, i) => n + (durationByUnit(i) ? i.quantity : 1) * i.duration_minutes,
    0,
  );
  const explanationRequired =
    items.length !== (original?.items.length || 0) ||
    new Set(items.map((i) => i.position)).size !== items.length ||
    globalDiscount > 0 ||
    items.some((i) => {
      const o = original?.items[i.position ?? -1];
      return (
        i.kind !== "original" ||
        !o ||
        i.unit_cents !== o.unit_cents ||
        i.quantity !== o.quantity ||
        i.duration_minutes !== (o.duration_minutes ?? 0) ||
        i.discount_cents > 0 ||
        Boolean(i.note.trim())
      );
    });
  const blockedReason = !pricesReady
    ? "Preencha os valores e quantidades de todos os itens."
    : total < 0
      ? "O total não pode ser negativo."
      : explanationRequired && explanation.trim().length < 2
        ? "Explique as alterações na proposta antes de enviar."
        : !expires
          ? "Informe a validade da proposta."
          : "";
  async function validate() {
    if (explanationRequired && explanation.trim().length < 2)
      throw Error("quote_explanation_required");
    return rpc<any>("operations_quote_calculate", args);
  }
  async function send() {
    setBusy(true);
    setError("");
    try {
      await validate();
      await rpc("operations_send_calculated_quote", {
        ...args,
        p_expires: new Date(expires + "T23:59:00-03:00").toISOString(),
        p_expected_revision: request.revision,
        p_explanation: explanation,
        p_key: sendKey.current,
      });
      setPreview(undefined);
      setNotice(
        "Proposta enviada. O cliente recebe esta versão no acompanhamento.",
      );
      await onSent();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function add() {
    const [kind, code] = choice.split(":");
    const c = catalog?.[kind === "service" ? "services" : "addons"]?.find(
      (i: any) => i.code === code,
    );
    if (!c) return;
    changed();
    setItems([
      ...items,
      {
        kind,
        code,
        name: c.name,
        quantity: 1,
        unit_cents: c.price_cents,
        duration_minutes: c.duration_minutes ?? 0,
        discount_cents: 0,
        note: "",
      },
    ]);
    setChoice("");
  }
  return (
    <section className="quote-workbench" aria-label="Calculadora de orçamento">
      <h2>Preparar proposta</h2>
      <p>
        Revise os itens, confirme os valores e explique os ajustes ao cliente.
      </p>
      {request.desired_start && (
        <p>
          Horário pretendido: <strong>{date(request.desired_start)}</strong>. A
          duração final será conferida na aprovação.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={busy || !catalog} className="quote-inputs">
        {items.map((i, n) => (
          <article className="quote-edit-item" key={n}>
            <div className="quote-item-title">
              <strong>
                {i.kind === "manual" ? "Item complementar" : i.name}
              </strong>
              <button
                type="button"
                onClick={() => {
                  changed();
                  setItems(items.filter((_, k) => k !== n));
                }}
              >
                Remover item {n + 1}
              </button>
            </div>
            {i.kind === "manual" && (
              <label>
                Descrição do item
                <input
                  value={i.name}
                  maxLength={300}
                  onChange={(e) => update(n, { name: e.target.value })}
                />
              </label>
            )}
            <div className="quote-fields">
              <label>
                Quantidade
                <input
                  aria-label={"Quantidade de " + i.name}
                  type="number"
                  min={1}
                  max={100}
                  value={i.quantity}
                  onChange={(e) =>
                    update(n, { quantity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Valor final unitário (R$)
                <input
                  aria-label={"Valor final de " + i.name}
                  type="number"
                  min={0}
                  step="0.01"
                  value={i.unit_cents === null ? "" : i.unit_cents / 100}
                  onChange={(e) =>
                    update(n, {
                      unit_cents:
                        e.target.value === ""
                          ? null
                          : Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              <label>
                {durationByUnit(i) ? "Duração por unidade (min)" : "Duração total deste serviço (min)"}
                <input
                  aria-label={"Duração de " + i.name}
                  type="number"
                  min={0}
                  max={10080}
                  value={i.duration_minutes}
                  onChange={(e) =>
                    update(n, { duration_minutes: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <details>
              <summary>Desconto e observação deste item</summary>
              <label>
                Desconto do item (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={i.discount_cents / 100}
                  onChange={(e) =>
                    update(n, {
                      discount_cents: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              <label>
                Observação para o cliente
                <input
                  maxLength={500}
                  value={i.note}
                  onChange={(e) => update(n, { note: e.target.value })}
                />
              </label>
            </details>
          </article>
        ))}
        <div className="quote-add">
          <label>
            Serviço ou adicional do catálogo
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Selecione</option>
              <optgroup label="Serviços">
                {catalog?.services.map((s: any) => (
                  <option key={s.code} value={"service:" + s.code}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Adicionais">
                {catalog?.addons.map((s: any) => (
                  <option key={s.code} value={"addon:" + s.code}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button type="button" disabled={!choice} onClick={add}>
            + Adicionar serviço / adicional
          </button>
          <button
            type="button"
            onClick={() => {
              changed();
              setItems([
                ...items,
                {
                  kind: "manual",
                  name: "",
                  quantity: 1,
                  unit_cents: null,
                  duration_minutes: 0,
                  discount_cents: 0,
                  note: "",
                },
              ]);
            }}
          >
            + Adicionar item
          </button>
        </div>
        <div className="quote-fields">
          <label>
            Desconto da proposta
            <select
              value={discountMode}
              onChange={(e) => {
                changed();
                setDiscountMode(e.target.value);
                setDiscountValue(0);
              }}
            >
              <option value="none">Sem desconto</option>
              <option value="percent">Percentual</option>
              <option value="amount">Valor em R$</option>
            </select>
          </label>
          {discountMode !== "none" && (
            <label>
              {discountMode === "percent" ? "Percentual (%)" : "Desconto (R$)"}
              <input
                type="number"
                min={0}
                step={discountMode === "percent" ? 1 : 0.01}
                value={discountValue}
                onChange={(e) => {
                  changed();
                  setDiscountValue(Number(e.target.value));
                }}
              />
            </label>
          )}
          <p>Teto autorizado: {catalog?.max_discount_percent ?? 0}%</p>
        </div>
        <div className="quote-total" aria-live="polite">
          {pricesReady ? (
            <>
              <span>Subtotal {money(subtotal)}</span>
              <span>Descontos {money(itemDiscount + globalDiscount)}</span>
              <strong>Total {money(total)}</strong>
            </>
          ) : (
            <strong>
              Valores a definir · preencha todos os itens para calcular o total.
            </strong>
          )}
          <span>Duração final {duration(totalMinutes)}</span>
        </div>
        <label>
          Explicação da proposta para o cliente{" "}
          {explanationRequired ? "*" : "(opcional)"}
          <textarea
            maxLength={2000}
            required={explanationRequired}
            aria-describedby="quote-explanation-help"
            aria-invalid={explanationRequired && explanation.trim().length < 2}
            value={explanation}
            onChange={(e) => {
              changed();
              setExplanation(e.target.value);
            }}
            placeholder="Explique a avaliação, os itens adicionais e as condições."
          />
        </label>
        <p
          id="quote-explanation-help"
          role={
            explanationRequired && !explanation.trim() ? "status" : undefined
          }
        >
          {explanationRequired
            ? "Uma alteração de valores, itens, duração, desconto ou condição exige uma explicação para o cliente."
            : "Sem alterações relevantes: você pode enviar sem explicação adicional."}
        </p>
        {totalMinutes > (catalog?.max_daily_minutes || 1440) && (
          <p className="notice">
            A duração excede o maior expediente diário. A divisão só estará
            disponível se todos os serviços permitirem vários períodos; confira
            a prévia antes de enviar.
          </p>
        )}
        <label>
          Válida até
          <input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={expires}
            onChange={(e) => {
              changed();
              setExpires(e.target.value);
            }}
          />
        </label>
        <p id="quote-send-reason" role="status">
          {blockedReason}
        </p>
        <div className="quote-actions">
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const q = await validate();
                setPreview({
                  ...q,
                  customer_explanation: explanation,
                  expires_at: new Date(
                    expires + "T23:59:00-03:00",
                  ).toISOString(),
                });
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Visualizar como cliente
          </button>
          <button
            type="button"
            className="primary"
            disabled={Boolean(blockedReason)}
            aria-describedby="quote-send-reason"
            onClick={() => void send()}
          >
            Enviar proposta final
          </button>
        </div>
      </fieldset>
      {preview && (
        <section className="quote-preview" aria-label="Prévia como cliente">
          <h3>Sua proposta</h3>
          <QuoteSummary quote={preview} />
          <p>
            {preview.execution?.mode === "split"
              ? "Execução permite múltiplos períodos, conforme disponibilidade."
              : "Execução contínua: precisa de uma única janela compatível."}
          </p>
          <button type="button" onClick={() => setPreview(undefined)}>
            Voltar à edição
          </button>
        </section>
      )}
      <p className="muted">
        O pedido original permanece no histórico. Notas internas ficam na
        conversa interna da empresa.
      </p>
    </section>
  );
}
