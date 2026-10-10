import { money } from "./api";
import { priceBreakdown } from "./request-items";
export function OrderPrices({
  items,
  review = false,
}: {
  items: any[];
  review?: boolean;
}) {
  const p = priceBreakdown(items);
  return (
    <div className="c-order-prices">
      {p.fixedCount > 0 && (
        <p>
          <span>
            {p.estimateCount || p.pending || review
              ? "Valores fixos conhecidos"
              : "Valor dos serviços"}
          </span>
          <strong>{money(p.fixed)}</strong>
        </p>
      )}
      {p.estimateCount > 0 && (
        <p>
          <span>Estimativa inicial dos itens a partir de</span>
          <strong>{money(p.estimate)}</strong>
        </p>
      )}
      {p.pending > 0 && (
        <p>
          {p.pending}{" "}
          {p.pending === 1 ? "item sob consulta" : "itens sob consulta"}. A
          empresa confirmará os valores.
        </p>
      )}
      {(p.pending > 0 || p.estimateCount > 0 || review) && (
        <small>
          O valor final será apresentado na proposta da empresa para sua
          aprovação.
        </small>
      )}
    </div>
  );
}
export function RequestedItems({ data }: { data: any }) {
  if (!data.requested_items?.length) return null;
  return (
    <section className="requested-items">
      <h3>
        Pedido original · {data.requested_items.length}{" "}
        {data.requested_items.length === 1 ? "serviço" : "serviços"}
      </h3>
      {data.requested_items.map((item: any) => (
        <article className="c-order-item" key={item.service}>
          <h4>
            {item.priced_items?.[0]?.quantity || 1} × {item.name}
          </h4>
          <p>
            Preço:{" "}
            {(
              {
                fixed: "fixo",
                from: "a partir de",
                quote: "sob consulta",
              } as Record<string, string>
            )[item.price_mode] || "a confirmar"}
          </p>
          {item.availability && <p>{item.availability}</p>}
          <p>
            Adicionais:{" "}
            {item.priced_items
              .slice(1)
              .map((a: any) => `${a.quantity || 1} × ${a.name}`)
              .join(", ") || "Nenhum"}
          </p>
          {item.answer_labels?.map((a: any, n: number) => (
            <p key={n}>
              <strong>{a.label}:</strong>{" "}
              {typeof a.answer === "boolean"
                ? a.answer
                  ? "Sim"
                  : "Não"
                : String(a.answer ?? "Não informado")}
            </p>
          ))}
          {item.notes && <p>Detalhes: {item.notes}</p>}
          <OrderPrices items={item.priced_items} />
        </article>
      ))}
      {data.review_alerts?.map((r: any, n: number) => (
        <p className="c-order-alert" key={n}>
          {(
            {
              includes: "Já incluído",
              incompatible: "Incompatível",
              review: "Requer revisão",
            } as Record<string, string>
          )[r.kind] || "Requer revisão"}
          : {r.source_name} + {r.target_name}. A empresa avaliará essa
          combinação.
        </p>
      ))}
      <p>
        A proposta abaixo pode ajustar os itens solicitados. O pedido original
        permanece registrado.
      </p>
    </section>
  );
}
