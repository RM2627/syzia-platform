import { duration } from "../scheduling/ExecutionSchedule";
import { money, date } from "./api";
export function QuoteSummary({ quote }: { quote: any }) {
  return (
    <div className="c-proposal-summary">
      {quote.items?.map((i: any, n: number) => (
        <div className="c-proposal-line" key={n}>
          <p>
            <strong>
              {i.quantity} × {i.name}
            </strong>
            <span>{money(i.quantity * i.unit_cents)}</span>
          </p>
          {i.public_note || i.note ? (
            <small>{i.public_note || i.note}</small>
          ) : null}
          {i.discount_cents > 0 && (
            <small>Desconto neste item: {money(i.discount_cents)}</small>
          )}
        </div>
      ))}
      <dl className="c-proposal-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{money(quote.subtotal_cents ?? quote.total_cents)}</dd>
        </div>
        <div>
          <dt>Descontos</dt>
          <dd>− {money(quote.discount_cents || 0)}</dd>
        </div>
        <div>
          <dt>
            <strong>Total da proposta</strong>
          </dt>
          <dd>
            <strong>{money(quote.total_cents)}</strong>
          </dd>
        </div>
      </dl>
      {quote.duration_minutes && (
        <p>
          Duração estimada: {duration(quote.duration_minutes)}
          {quote.execution_mode === "split" ? " · Permite vários períodos" : ""}
        </p>
      )}
      {quote.customer_explanation && <p>{quote.customer_explanation}</p>}
      {quote.expires_at && <p>Válida até {date(quote.expires_at)}</p>}
      {quote.desired_start && (
        <p>Horário pretendido no pedido: {date(quote.desired_start)}.</p>
      )}
    </div>
  );
}
