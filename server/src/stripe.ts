import Stripe from 'stripe';

import {
  classifyCheckout,
  confirmCheckout,
  gateRefund,
  planChargeRefund,
  shouldExpireOpenCheckout,
  type CheckoutState,
  type ConfirmedPayment,
} from './checkout.js';
import { stripeLiveSecretKey, stripeSecretKey } from './env.js';
import { PaymentError } from './errors.js';

export { PaymentError };
export type { CheckoutState, ConfirmedPayment };

function stripe(): Stripe {
  if (!stripeSecretKey) {
    throw new PaymentError(503, 'Stripe is not configured. Add STRIPE_LIVE_SECRET_KEY or STRIPE_TEST_SECRET_KEY to .env.');
  }
  return new Stripe(stripeSecretKey);
}

if (stripeSecretKey) {
  console.log(stripeLiveSecretKey ? 'Stripe is using the live secret key.' : 'Stripe is using the test secret key.');
}

export async function inspectCheckout(sessionId: string): Promise<CheckoutState> {
  return classifyCheckout(await retrieve(sessionId));
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
  const gate = gateRefund(await retrieve(input.sessionId), input);
  if (gate.action === 'missing') {
    throw new PaymentError(
      409,
      'The Stripe payment for this registration could not be found, so it was not canceled.',
    );
  }
  if (gate.action === 'forbidden') {
    throw new PaymentError(403, 'That payment belongs to another registration.');
  }
  if (gate.action === 'expire') {
    try {
      await stripe().checkout.sessions.expire(input.sessionId);
    } catch (error) {
      throw stripeFailure(error);
    }
    return;
  }
  if (gate.action === 'skip') {
    return;
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe().paymentIntents.retrieve(gate.paymentIntentId, { expand: ['latest_charge'] });
  } catch (error) {
    throw stripeFailure(error);
  }

  const chargeRefund = planChargeRefund(intent);
  if (chargeRefund.action === 'amount') {
    throw new PaymentError(400, 'The payment amount does not match a booth fee, so it was not refunded.');
  }
  if (chargeRefund.action === 'skip') {
    return;
  }

  try {
    await stripe().refunds.create(
      {
        payment_intent: gate.paymentIntentId,
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
  const confirmation = confirmCheckout(await retrieve(sessionId));
  if (!confirmation.ok) {
    throw new PaymentError(400, confirmation.message);
  }
  return confirmation.payment;
}

export async function expireOpenCheckout(sessionId: string): Promise<void> {
  const session = await retrieve(sessionId);
  if (!shouldExpireOpenCheckout(session)) {
    return;
  }
  try {
    await stripe().checkout.sessions.expire(sessionId);
  } catch (error) {
    throw stripeFailure(error);
  }
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
