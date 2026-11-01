import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function checkout(req, res) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: req.body.items,
    success_url: 'https://example.com/ok',
  });
  res.json({ url: session.url });
}
