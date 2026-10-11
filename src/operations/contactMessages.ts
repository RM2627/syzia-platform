/** Only authorized canonical document fields enter this message. Never add technical references. */
export function quoteContactMessage(document: {
  company: { name: string };
  status: string;
  content: { price_mode: string; total_cents: number | null };
}) {
  const value =
    document.content.total_cents == null
      ? "sob consulta"
      : new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(document.content.total_cents / 100);
  return `Olá! Aqui é da ${document.company.name}.\n${document.status}.\nValor ${document.content.price_mode === "from" ? "a partir de " : ""}${value}.\nEstamos à disposição para esclarecer seu orçamento.`;
}
export function trackingContactMessage(company: string, url: string) {
  return `Olá! Aqui é da ${company}. Segue o acesso para acompanhar sua solicitação e conversar conosco: ${url}\nO link é pessoal, válido por 7 dias e fica vinculado ao primeiro navegador que o abrir. Se precisar trocar de navegador, peça um novo acesso.`;
}
