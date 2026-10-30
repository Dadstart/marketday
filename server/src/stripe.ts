import Stripe from 'stripe';

import { stripeTestSecretKey } from './env.js';
import { isBoothFee } from './fees.js';

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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

function stripe(): Stripe {
  if (!stripeTestSecretKey) {
    throw new PaymentError(503, 'Stripe is not configured. Add STRIPE_TEST_SECRET_KEY to .env.');
  }
  return new Stripe(stripeTestSecretKey);
}

export async function inspectCheckout(sessionId: string): Promise<CheckoutState> {
  const session = await retrieve(sessionId);
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

export async function createBoothCheckout(input: {
  registrationId: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  email: string;
  amountCents: number;
  resident: boolean;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: input.email,
      client_reference_id: input.registrationId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        registrationId: input.registrationId,
        userId: input.userId,
        eventId: input.eventId,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: input.amountCents,
            product_data: {
              name: `${input.eventTitle} booth fee`,
              description: input.resident ? 'Crosswinds resident booth fee' : 'Booth fee',
            },
          },
        },
      ],
    });
  } catch (error) {
    throw stripeFailure(error);
  }

  if (!session.url) {
    throw new PaymentError(502, 'Stripe did not return a payment page.');
  }
  return { id: session.id, url: session.url };
}

export async function refundRegistrationPayment(input: {
  sessionId: string;
  registrationId: string;
  userId: string;
  eventId: string;
}): Promise<void> {
  const session = await retrieve(input.sessionId);
  if (!session) {
    throw new PaymentError(
      409,
      'The Stripe payment for this registration could not be found, so it was not canceled.',
    );
  }
  if (
    session.metadata?.registrationId !== input.registrationId ||
    session.metadata?.userId !== input.userId ||
    session.metadata?.eventId !== input.eventId
  ) {
    throw new PaymentError(403, 'That payment belongs to another registration.');
  }

  if (session.status === 'open') {
    try {
      await stripe().checkout.sessions.expire(input.sessionId);
    } catch (error) {
      throw stripeFailure(error);
    }
    return;
  }

  if (session.payment_status !== 'paid') {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) {
    throw new PaymentError(
      409,
      'The Stripe payment for this registration could not be found, so it was not canceled.',
    );
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  } catch (error) {
    throw stripeFailure(error);
  }

  const amount = intent.amount_received || intent.amount;
  if (!isBoothFee(amount)) {
    throw new PaymentError(400, 'The payment amount does not match a booth fee, so it was not refunded.');
  }
  const charge = intent.latest_charge;
  if (charge && typeof charge !== 'string' && charge.amount_refunded >= amount) {
    return;
  }

  try {
    await stripe().refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
      },
      { idempotencyKey: `registration-refund-${input.registrationId}` },
    );
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'charge_already_refunded') {
      return;
    }
    throw stripeFailure(error);
  }
}

export async function confirmedPayment(sessionId: string): Promise<ConfirmedPayment> {
  const session = await retrieve(sessionId);
  if (!session) {
    throw new PaymentError(400, 'That payment session is not valid.');
  }
  if (session.payment_status !== 'paid') {
    throw new PaymentError(400, 'The payment is not complete.');
  }
  const amountCents = session.amount_total ?? 0;
  if (!isBoothFee(amountCents)) {
    throw new PaymentError(400, 'The payment amount does not match a booth fee.');
  }
  const registrationId = session.metadata?.registrationId;
  const userId = session.metadata?.userId;
  const eventId = session.metadata?.eventId;
  if (!registrationId || !userId || !eventId) {
    throw new PaymentError(400, 'The payment is missing registration details.');
  }
  return { registrationId, userId, eventId, amountCents };
}

async function retrieve(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  if (!sessionId.startsWith('cs_')) {
    return null;
  }
  try {
    return await stripe().checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return null;
    }
    throw stripeFailure(error);
  }
}

function stripeFailure(error: unknown): PaymentError {
  if (error instanceof PaymentError) {
    return error;
  }
  if (error instanceof Stripe.errors.StripeError) {
    return new PaymentError(502, 'Stripe could not complete the payment request.');
  }
  return new PaymentError(502, 'Stripe could not complete the payment request.');
}
