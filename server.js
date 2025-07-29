require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(bodyParser.json());

app.post('/create-checkout-session', async (req, res) => {
  const { recipient, sort_code, account_number, reference, amount } = req.body;

  const feeRate = 0.05;
  const total = Math.round(amount * (1 + feeRate) * 100); // in pence

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `Invoice Payment to ${recipient}`
          },
          unit_amount: total
        },
        quantity: 1
      }],
      metadata: {
        recipient,
        sort_code,
        account_number,
        reference,
        original_amount: amount,
        total_with_fee: total / 100
      },
      success_url: 'https://lucentpay.co/pages/payment-success',
      cancel_url: 'https://lucentpay.co/pages/payment-cancelled'
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('LucentPay Checkout Backend is live.');
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
