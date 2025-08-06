const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);// Replace with your LIVE or TEST key
require("dotenv").config();

app.use(cors());
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      recipient,
      sort_code,
      account_number,
      reference,
      amount,
      fee_rate,
      plan,
      email
    } = req.body;

    if (
      !recipient ||
      !sort_code ||
      !account_number ||
      !reference ||
      !amount ||
      !fee_rate ||
      !email
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const numericAmount = parseFloat(amount);
    const feeMultiplier = 1 + parseFloat(fee_rate);
    const totalAmount = Math.round(numericAmount * feeMultiplier * 100); // in pence

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      success_url: "https://lucentpay.co/pages/payment-success",
      cancel_url: "https://lucentpay.co/pages/payment-cancelled",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Invoice Payment to ${recipient}`,
              description: `Ref: ${reference}`
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        recipient,
        sort_code,
        account_number,
        reference,
        original_amount: numericAmount,
        total_with_fee: totalAmount / 100,
        plan,
        email
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(4242, () => console.log("Server running on port 4242"));
