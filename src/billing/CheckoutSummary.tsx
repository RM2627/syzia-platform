export const checkoutMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
export function CheckoutSummary({
  plan,
  eligible,
  eligibilityPending,
}: {
  plan: any;
  eligible: boolean;
  eligibilityPending: boolean;
}) {
  const benefits = [
    "Página com identidade visual personalizada",
    "Serviços, orçamentos e agenda",
    "Atendimento pela própria equipe",
  ];
  if (plan.capabilities?.finance) benefits.push("Gestão financeira");
  if (plan.capabilities?.analytics) benefits.push("Indicadores da operação");
  if (plan.capabilities?.commercial_followups)
    benefits.push("Acompanhamento comercial");
  return (
    <section
      role="complementary"
      className="mp-summary"
      aria-labelledby="mp-summary-heading"
    >
      <div className="mp-summary-top">
        <span className="mp-eyebrow">SEU PLANO SYZIA</span>
        <h2 id="mp-summary-heading">{plan.name}</h2>
        <p className="mp-price">
          {checkoutMoney(plan.price_cents)}
          <span>/mês</span>
        </p>
        <p>Cobrança mensal · em reais</p>
      </div>
      <ul className="mp-benefits">
        {benefits.map((text) => (
          <li key={text}>
            <span aria-hidden="true">✓</span>
            {text}
          </li>
        ))}
        {Object.hasOwn(plan, "member_limit") && (
          <li>
            <span aria-hidden="true">✓</span>
            {plan.member_limit == null
              ? "Integrantes sem limite de quantidade"
              : `Até ${plan.member_limit} ${plan.member_limit === 1 ? "integrante" : "integrantes"} na equipe`}
          </li>
        )}
      </ul>
      <div className="mp-trial-note">
        <strong>
          {eligibilityPending
            ? "Verificando elegibilidade"
            : eligible
              ? "Elegível a 7 dias grátis"
              : "Assinatura sem novo período grátis"}
        </strong>
        <p>
          {eligibilityPending
            ? "Confirme os dados solicitados para verificar a condição disponível."
            : eligible
              ? `Depois, ${checkoutMoney(plan.price_cents)}/mês. O período grátis precisa ser reconhecido pelo Mercado Pago para liberar o acesso.`
              : "O valor mensal se aplica à contratação. Um período grátis anterior não é reiniciado."}
        </p>
      </div>
      <dl className="mp-summary-details">
        <div>
          <dt>Valor inicial</dt>
          <dd>A confirmar</dd>
        </div>
        <div>
          <dt>Primeira cobrança</dt>
          <dd>A confirmar</dd>
        </div>
      </dl>
      <p className="mp-hint">
        A data e a condição inicial serão exibidas após a confirmação. Nenhuma
        data estimada é uma cobrança agendada.
      </p>
      <div className="mp-renewal">
        <strong>Renovação e cancelamento</strong>
        <p>
          A renovação é mensal. Você pode solicitar o cancelamento na área de
          assinatura e acompanhar sua confirmação, mantendo o acesso até o fim
          do período gratuito ou pago reconhecido.
        </p>
      </div>
    </section>
  );
}
