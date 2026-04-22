const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { api: { bodyParser: false } };

const getRawBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => resolve(Buffer.from(data)));
  req.on('error', reject);
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook Signatur ungültig:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (stripeEvent.type === 'payment_intent.succeeded') {
      const pi = stripeEvent.data.object;
      if (pi.metadata?.type !== 'late_fee') {
        await supabase.from('bookings')
          .update({ status: 'confirmed' })
          .eq('stripe_payment_intent_id', pi.id)
          .eq('status', 'pending');
      }
    }

    if (stripeEvent.type === 'payment_intent.payment_failed') {
      const pi = stripeEvent.data.object;
      if (pi.metadata?.type === 'late_fee') {
        await supabase.from('bookings')
          .update({ late_fee_payment_intent_id: `FAILED:${pi.id}` })
          .eq('id', pi.metadata.booking_id);
      }
    }
  } catch (err) {
    console.error('Webhook Handler Fehler:', err);
  }

  return res.status(200).json({ received: true });
};
