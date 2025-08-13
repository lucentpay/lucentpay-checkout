// server.js — LucentPay Checkout Service (CORS-friendly for Shopify)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// ----- CORS: allow lucentpay.co, www, myshopify previews & admin preview -----
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsCheck = (origin, cb) => {
  if (!origin) return cb(null, true); // allow curl/server-to-server/no-origin
  try {
    const u = new URL(origin);
    const host = u.host.toLowerCase();

    const allow =
      ALLOWED.includes(origin) ||
      host === 'lucentpay.co' ||
      host === 'www.lucentpay.co' ||
      host.endsWith('.myshopify.com') ||
      host === 'admin.shopify.com';

    return allow ? cb(null, true) : cb(new Error('Not allowed by CORS'));
  } catch {
    return cb(new Error('Bad Origin'));
  }
};
app.use(cors({ origin: corsCheck }));

// ----- Stripe -----
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const PRICE_ID   = process.env.STRIPE_PRICE_PRO || '';
const SITE_BASE  = process.env.SITE_BASE_URL || 'https://lucentpay.co';

let stripe = null;
if (STRIPE_KEY) {
  const Stripe = (await import('stripe')).default;
  stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });
}

// ----- Health -----
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'lucentpay-checkout',
    time: new Date().toISOString(),
    hasStripeKey: Boolean(STRIPE_KEY),
    hasPrice: Boolean(PRICE_ID)
  });
});

// ----- Create Pro Checkout -----
app.post('/create-pro-checkout', async (req, res) => {
  try {
    if (!stripe || !PRICE_ID) {
      return res.status(500).json({ error: 'Server not configured for Stripe (missing env).' });
    }

    const email = (req.body?.email || '').trim();

    const session = await stripe.checkout.sessions.create({
      // If your Stripe Price is one-time: use mode: 'payment'
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],

      success_url: `${SITE_BASE}/pages/verify-pro?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_BASE}/products/lucentpay-pro?canceled=1`,

      customer_email: email || undefined,
      metadata: { source: 'lucentpay-pro', site: SITE_BASE }
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('create-pro-checkout error:', err);
    return res.status(500).json({ error: 'Unable to start checkout' });
  }
});

// ----- Start -----
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
