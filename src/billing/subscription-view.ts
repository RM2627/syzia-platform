// Presentation only. Backend contracts, permissions and financial confirmation remain authoritative.
export type Offer = {
  code: string; product_name?: string; modality?: string; description?: string;
  checkout_available?: boolean; saving_cents?: number; discount_percent?: number;
  price_cents: number; interval_months: number; member_limit: number; service_limit: number; request_limit: number;
};
export type Subscription = {
  id: string; state: string; offer: string; environment: string; trial_end: string | null;
  access_until: string | null; next_charge: string | null; pending: boolean; cancel_requested: boolean;
  checkout_url: string | null; error_code: string | null;
};
export type CheckoutContext = {
  checkout_mode: 'internal' | 'stripe' | 'disabled'; environment: string; provider: string | null;
  stripe_available: boolean; stripe_operations_available?: boolean; confirmation_enabled: boolean; test_allowed: boolean; eligibility: string;
  catalog: Offer[]; subscription: Subscription | null;
};
export const modalityNames: Record<string, string> = {monthly: 'Mensal', semiannual: 'Semestral', annual: 'Anual'};
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
export function confirmedDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo'}).format(new Date(value));
}
export function checkoutURL(value: string | null) {
  try { const u = new URL(value || ''); return u.protocol === 'https:' && u.hostname === 'checkout.stripe.com' && !u.port && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
export function canStartCheckout(data: CheckoutContext | null) {
  return !!data && data.checkout_mode === 'stripe' && data.stripe_available === true && data.confirmation_enabled === true && data.test_allowed === true
    && ['eligible', 'previous_identity', 'previous_grant'].includes(data.eligibility) && !data.subscription;
}
export function confirmationPending(s: Subscription | null) {
  // A prepared commercial configuration or a return URL is not a financial operation.
  return !!s?.id && (s.pending === true || ['payment_pending', 'reconciliation'].includes(s.state));
}
export function managementAction(data: CheckoutContext | null, now = Date.now()): 'cancel' | 'resume' | null {
  const s = data?.subscription;
  // Read-only runtime signal is separate from new-sales availability; SQL still authorizes every command.
  if (!data || data.stripe_operations_available !== true || !data.stripe_available || !s || s.pending
    || !['active', 'trialing', 'cancel_scheduled', 'grace_period'].includes(s.state)) return null;
  if (!s.cancel_requested) return 'cancel';
  return s.access_until && Date.parse(s.access_until) > now ? 'resume' : null;
}
export function subscriptionState(s: Subscription | null, prepared = false) {
  if (!s) return {title: prepared ? 'Cadastro preparado' : 'Sem assinatura', tone: 'neutral', detail: 'Nenhuma assinatura confirmada. Confira as modalidades e as condições abaixo.'};
  if (s.cancel_requested && ['active', 'trialing', 'cancel_scheduled', 'grace_period'].includes(s.state))
    return {title: 'Cancelamento programado', tone: 'warning', detail: 'A renovação foi cancelada. Consulte abaixo o período confirmado.'};
  if (s.checkout_url && ['payment_pending', 'reconciliation'].includes(s.state))
    return {title: 'Checkout em andamento', tone: 'pending', detail: 'Existe uma contratação iniciada. Continue a sessão existente, sem criar outra assinatura.'};
  const states: Record<string, {title: string; tone: string; detail: string}> = {
    trialing: {title: 'Trial confirmado', tone: 'success', detail: 'Seu período gratuito está confirmado. Confira abaixo a data de término.'},
    active: {title: 'Assinatura ativa', tone: 'success', detail: 'Assinatura confirmada. Acompanhe o período e a próxima cobrança confirmados.'},
    payment_pending: {title: 'Pagamento pendente', tone: 'pending', detail: 'A confirmação financeira ainda está pendente. Atualize o status para consultar o resultado.'},
    reconciliation: {title: 'Confirmação em andamento', tone: 'pending', detail: 'A operação está sendo conferida. Não é necessário iniciar outra contratação.'},
    grace_period: {title: 'Pagamento pendente', tone: 'warning', detail: 'Há uma pendência de pagamento. O acesso continua sujeito às regras do contrato.'},
    cancel_scheduled: {title: 'Cancelamento programado', tone: 'warning', detail: 'Acompanhe o período informado e as opções disponíveis para esta assinatura.'},
    canceled: {title: 'Assinatura cancelada', tone: 'neutral', detail: 'Este contrato está encerrado. Não há uma nova contratação confirmada.'},
    paused: {title: 'Assinatura pausada', tone: 'warning', detail: 'Consulte o suporte para conferir as condições desta assinatura.'},
    restricted: {title: 'Acesso restrito', tone: 'warning', detail: 'A situação financeira exige regularização. Consulte o status antes de prosseguir.'},
  };
  return states[s.state] || {title: 'Aguardando validação', tone: 'neutral', detail: 'A situação desta assinatura ainda precisa ser confirmada.'};
}
