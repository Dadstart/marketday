import Stripe from 'stripe';

import { stripeSecretKey } from './src/env.ts';

if (!stripeSecretKey) {
  console.log('no stripe key');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey);
try {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: 'http://localhost:8081/?checkout_session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'http://localhost:8081/',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: 500,
          product_data: { name: 'Market Day booth fee check' },
        },
      },
    ],
  });
  console.log(session.id.startsWith('cs_live_') ? 'created live session' : 'created session');
  await stripe.checkout.sessions.expire(session.id);
  console.log('expired');
} catch (error) {
  if (error instanceof Stripe.errors.StripeError) {
    console.log(`type=${error.type}`);
    console.log(`code=${error.code ?? ''}`);
    console.log(`message=${error.message}`);
  } else {
    console.log(error instanceof Error ? error.message : 'unknown error');
  }
}
