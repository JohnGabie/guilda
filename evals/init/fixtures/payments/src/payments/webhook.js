import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export function webhook(req, res) {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET,
  );
  if (event.type === 'checkout.session.completed') {
    // mark the order paid
  }
  res.sendStatus(200);
}
