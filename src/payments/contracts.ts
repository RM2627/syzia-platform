// Contracts only. No payment processor or simulated success in the consumer journey.
export type PaymentOrigin = "external" | "integrated";
export type PaymentStatus =
  | "not_required"
  | "pending"
  | "awaiting_confirmation"
  | "partial"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refund_pending"
  | "refunded";
export type ConfirmationOrigin = "manual_external" | "provider_verified" | null;
export interface PaymentRecord {
  organizationId: string;
  requestId: string;
  quoteVersionId: string;
  appointmentId?: string;
  amountCents: number;
  confirmedCents: number;
  refundedCents: number;
  currency: "BRL";
  kind: "total" | "deposit";
  origin: PaymentOrigin;
  status: PaymentStatus;
  confirmationMethod: ConfirmationOrigin;
  confirmedBy?: string;
  confirmedAt?: string;
  provider?: string;
  externalId?: string;
  expiresAt?: string;
}
export interface FutureReservationHold {
  organizationId: string;
  requestId: string;
  paymentPlanId: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  state: "awaiting_payment" | "expired" | "confirmed" | "cancelled";
}
export function confirmationLabel(
  record: Pick<PaymentRecord, "status" | "origin" | "confirmationMethod">,
) {
  if (record.confirmationMethod === "manual_external")
    return "Pagamento externo registrado pela empresa";
  if (record.confirmationMethod === "provider_verified")
    return "Pagamento confirmado pelo provedor";
  if (record.status === "not_required") return "Sem pagamento antecipado";
  return "Pagamento ainda não confirmado";
}
