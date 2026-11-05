import { isBoothFee } from './fees.js';

export type CheckoutState =
  | { kind: 'paid'; amountCents: number }
  | { kind: 'open'; url: string; amountCents: number }
  | { kind: 'none' };

export type ConfirmedPayment = {
  registrationId: string;
  userId: string;
  eventId: string;
  amountCents: number;
};

export type CheckoutSessionView = {
  status?: string | null;
  payment_status?: string | null;
  url?: string | null;
  amount_total?: number | null;
  payment_intent?: string | { id?: string | null } | null;
  metadata?: {
    registrationId?: string;
    userId?: string;
    eventId?: string;
  } | null;
};

export type ChargeView = {
  amount_received?: number | null;
  amount: number;
  latest_charge?: string | { amount_refunded?: number | null } | null;
};

export function classifyCheckout(session: CheckoutSessionView | null): CheckoutState {
  if (!session) {
    return { kind: 'none' };
  }
  const amountCents = session.amount_total ?? 0;
  if (session.payment_status === 'paid' && isBoothFee(amountCents)) {
    return { kind: 'paid', amountCents };
  }
  if (session.status === 'open' && session.url && isBoothFee(amountCents)) {
    return { kind: 'open', url: session.url, amountCents };
  }
  return { kind: 'none' };
}

export type Confirmation =
  | { ok: true; payment: ConfirmedPayment }
  | { ok: false; message: string };

export function confirmCheckout(session: CheckoutSessionView | null): Confirmation {
  if (!session) {
    return { ok: false, message: 'That payment session is not valid.' };
  }
  if (session.payment_status !== 'paid') {
    return { ok: false, message: 'The payment is not complete.' };
  }
  const amountCents = session.amount_total ?? 0;
  if (!isBoothFee(amountCents)) {
    return { ok: false, message: 'The payment amount does not match a booth fee.' };
  }
  const registrationId = session.metadata?.registrationId;
  const userId = session.metadata?.userId;
  const eventId = session.metadata?.eventId;
  if (!registrationId || !userId || !eventId) {
    return { ok: false, message: 'The payment is missing registration details.' };
  }
  return { ok: true, payment: { registrationId, userId, eventId, amountCents } };
}

export type RefundGate =
  | { action: 'missing' }
  | { action: 'forbidden' }
  | { action: 'expire' }
  | { action: 'skip' }
  | { action: 'refund'; paymentIntentId: string };

export function gateRefund(
  session: CheckoutSessionView | null,
  input: { registrationId: string; userId: string; eventId: string },
): RefundGate {
  if (!session) {
    return { action: 'missing' };
  }
  if (
    session.metadata?.registrationId !== input.registrationId ||
    session.metadata?.userId !== input.userId ||
    session.metadata?.eventId !== input.eventId
  ) {
    return { action: 'forbidden' };
  }
  if (session.status === 'open') {
    return { action: 'expire' };
  }
  if (session.payment_status !== 'paid') {
    return { action: 'skip' };
  }
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) {
    return { action: 'missing' };
  }
  return { action: 'refund', paymentIntentId };
}

export type ChargeRefund = { action: 'amount' } | { action: 'skip' } | { action: 'refund' };

export function planChargeRefund(intent: ChargeView): ChargeRefund {
  const amount = intent.amount_received || intent.amount;
  if (!isBoothFee(amount)) {
    return { action: 'amount' };
  }
  const charge = intent.latest_charge;
  if (charge && typeof charge !== 'string' && (charge.amount_refunded ?? 0) >= amount) {
    return { action: 'skip' };
  }
  return { action: 'refund' };
}

export function shouldExpireOpenCheckout(session: CheckoutSessionView | null): boolean {
  return Boolean(session && session.status === 'open');
}
