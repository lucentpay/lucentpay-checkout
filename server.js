// server.js — LucentPay Checkout backend (full file)
//
// - Auto-detects Stripe price type and sets Checkout mode accordingly
// - Permissive to CLI tools (no Origin header) but enforces CORS for browsers
// - Works for both one-time and recurring Pro membership prices
//
// Env vars required on Render (Dashboard → Environment):
//   STRIPE_SECRET_KEY = sk_test_... or sk_live_...
//   STRIPE_PRICE_PRO  = price_xxx (the Pro price ID in Stripe)
//   SITE_BASE_URL     = https://lucentpay.co
//   ALLOWED_ORIGINS   = https://lucentpay.co,https://www.lucentpay.co
//
// Start: `npm start` (Render uses this)

import express from 'express';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import cors from 'cors';

dotenv.config();

const {
  STRIPE_SECRET_KEY,
  STRIPE_PRICE_PRO,
  SITE_BASE_URL = 'https://lucentpay.co',
  ALLOWED_ORIGINS = ''
} = process.env;

if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_PRO) {
  // Don’t crash; show clear message at /
  console.warn('[WARN] Missing STRIPE_SECRET_KEY or STRIPE_PRICE_PRO');
}

const stripe = new Stripe(STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

const app = express();
const PORT = process.env.PORT || 4242;

// --- CORS (browser) ---
const allowed = ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow requests with no Origin (curl/Postman/Stripe webhooks)
  if (!origin) return next();
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return next();
});
app.options('*', (req, res) => {
  res.status(204).end();
});

app.use(express.json());

// Health
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'lucentpay-checkout',
    time: new Date().toISOString(),
    hasStripeKey: Boolean(STRIPE_SECRET_KEY),
    hasPrice: Boolean(STRIPE_PRICE_PRO)
  });
});

// Create Stripe Checkout for Pro
app.post('/create-pro-checkout', async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_PRO) {
      return res.status(500).json({ error: 'Server not configured for Stripe (missing env).' });
    }

    const { email } = req.body || {};

    // Look up the price to decide mode automatically
    const price = await stripe.prices.retrieve(STRIPE_PRICE_PRO);
    const isRecurring = !!price.recurring;
    const mode = isRecurring ? 'subscription' : 'payment';

    const successUrl = `${SITE_BASE_URL}/pages/verify-pro?status=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${SITE_BASE_URL}/products/lucentpay-pro?status=cancelled`;

    const params = {
      success_url: successUrl,
      cancel_url: cancelUrl,
      mode,
      line_items: [{ price: STRIPE_PRICE_PRO, quantity: 1 }],
      // optional niceties:
      billing_address_collection: 'required',
      allow_promotion_codes: false,
      // Pre-fill email if provided
      ...(email ? { customer_email: email } : {})
    };

    // For one-time payments, submit button text can be set
    if (!isRecurring) params.submit_type = 'pay';

    const session = await stripe.checkout.sessions.create(params);
    return res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(400).json({ error: 'Unable to start checkout' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
