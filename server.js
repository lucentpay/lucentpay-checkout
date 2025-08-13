// server.js — LucentPay Checkout Service (auto-detect Stripe price type, CORS for Shopify)
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

// Cache retrieved price info in memory to avoid hitting Stripe every time
let cachedPrice = null;

async function getPriceInfo() {
  if (!stripe || !PRICE_ID) return null;
  if (cachedPrice) return cachedPrice;
  const price = await stripe.prices.retrieve(PRICE_ID);
  // price.type is 'one_time' or 'recurring'
  cachedPrice = {
    id: price.id,
    type: price.type,
    nickname: price.nickname || '',
    currency: price.currency,
    unit_amount: price.unit_amount,
    recurring: price.recurring || null
  };
  return cachedPrice;
}

// ----- Health -----
app.get('/', async (req, res) => {
  let priceInfo = null;
  try { priceInfo = await getPriceInfo(); } catch (e) { /* ignore on health */ }
  res.json({
    ok: true,
    service: 'lucentpay-checkout',
    time: new Date().toISOString(),
    hasStripeKey: Boolean(STRIPE_KEY),
    hasPrice: Boolean(PRICE_ID),
    priceInfo
  });
});

// Debug endpoint you can curl to confirm price type
app.get('/debug/price', async (req, res) => {
  try {
    if (!stripe || !PRICE_ID) {
      return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY or STRIPE_PRICE_PRO' });
    }
    const info = await getPriceInfo();
    return res.json({ ok: true, price: info });
  } catch (err) {
    console.error('debug/price error:', err);
    return res.status(500).json({ error: err.message || 'Price lookup failed' });
  }
});

// ----- Create Pro Checkout -----
app.post('/create-pro-checkout', async (req, res) => {
  try {
    if (!stripe || !PRICE_ID) {
      return res.status(500).json({ error: 'Server not configured for Stripe (missing env).' });
    }

    const email = (req.body?.email || '').trim();
    const price = await getPriceInfo();
    if (!price) {
      return res.status(500).json({ error: 'Unable to load price info.' });
    }

    // Auto-select correct mode based on price.type
    const isRecurring = price.type === 'recurring';
    const mode = isRecurring ? 'subscription' : 'payment';

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${SITE_BASE}/pages/verify-pro?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_BASE}/products/lucentpay-pro?canceled=1`,
      customer_email: email || undefined,
      metadata: { source: 'lucentpay-pro', site: SITE_BASE }
    });

    return res.json({ url: session.url });
  } catch (err) {
    // Surface Stripe error message for easier debugging in the browser
    const msg = err?.message || 'Unable to start checkout';
    console.error('create-pro-checkout error:', msg);
    return res.status(500).json({ error: msg });
  }
});

// ----- Start -----
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
