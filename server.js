/* server.js — Complete file */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// --- Config / Stripe ---
const app = express();
const PORT = process.env.PORT || 4242;
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://lucentpay.co';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO;
const stripe = require('stripe')(STRIPE_SECRET_KEY);

// --- CORS ---
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'LucentPay Checkout');
  next();
});

app.use(cors({
  origin: function (origin, cb) {
    // allow same-origin or no origin (like curl/postman)
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: Origin not allowed'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(bodyParser.json());

// --- Healthcheck ---
app.get('/', (req, res) => {
  res.status(200).json({ ok: true, service: 'lucentpay-checkout', time: new Date().toISOString() });
});

/**
 * Create a Stripe Checkout Session for LucentPay Pro (£95 / year).
 * On success, customer is returned to /pages/verify-pro.
 */
app.post('/create-pro-checkout', async (req, res) => {
  try {
    if (!STRIPE_PRICE_PRO) throw new Error('Missing STRIPE_PRICE_PRO');
    const email = req.body && req.body.email ? String(req.body.email).trim() : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: STRIPE_PRICE_PRO, quantity: 1 }
      ],
      customer_email: email || undefined,
      allow_promotion_codes: false,
      success_url: `${SITE_BASE_URL}/pages/verify-pro?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_BASE_URL}/products/lucentpay-pro`,
      metadata: {
        product: 'lucentpay_pro_membership'
      },
      subscription_data: {
        metadata: {
          plan: 'lucentpay_pro_annual'
        }
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Unable to start checkout' });
  }
});

/**
 * Optional: Verify a session from the verify-pro page (if you want).
 * GET /verify-session?session_id=cs_...
 */
app.get('/verify-session', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    const s = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'customer']
    });

    res.json({
      id: s.id,
      status: s.status,
      mode: s.mode,
      customer_email: s.customer_details?.email || s.customer?.email || null,
      subscription_status: s.subscription?.status || null
    });
  } catch (err) {
    console.error('verify-session error:', err);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
