// Future server-only port. No implementation, provisioning, network calls or card storage.
export interface ProviderChargeInput {merchantAccountRef:string;organizationId:string;quoteVersionId:string;paymentPlanId:string;amountCents:number;currency:'BRL';kind:'total'|'deposit';idempotencyKey:string;expiresAt:string;}
export interface VerifiedPaymentEvent {provider:string;eventId:string;merchantAccountRef:string;externalChargeId:string;organizationId:string;paymentPlanId:string;amountCents:number;currency:'BRL';state:'paid'|'failed'|'expired'|'refunded';occurredAt:string;}
export interface PaymentProviderPort {
 createCharge(input:ProviderChargeInput):Promise<{externalChargeId:string;hostedCheckoutUrl:string;expiresAt:string}>;
 verifyWebhook(rawBody:Uint8Array,headers:Readonly<Record<string,string>>):Promise<VerifiedPaymentEvent>;
 requestRefund(input:{externalChargeId:string;amountCents:number;idempotencyKey:string}):Promise<{externalRefundId:string}>;
}
export const PAYMENT_PROCESSING_ENABLED=false as const;
// A later phase must authenticate merchant ownership, validate signatures/replays,
// reconcile event amount/currency/version, store unique event IDs, and run all mutations
// transactionally. Funds must flow provider -> merchant; platform custody is out of scope.
