const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook Signatur ungültig:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    if (stripeEvent.type === 'payment_intent.succeeded') {
      const pi = stripeEvent.data.object;

      // Nur Hauptbuchungen bestätigen (nicht Verspätungsaufpreise)
      if (pi.metadata?.type !== 'late_fee') {
        await supabase
          .from('bookings')
          .update({ status: 'confirmed' })
          .eq('stripe_payment_intent_id', pi.id)
          .eq('status', 'pending');
      }
    }

    if (stripeEvent.type === 'payment_intent.payment_failed') {
      const pi = stripeEvent.data.object;
      if (pi.metadata?.type === 'late_fee') {
        const { metadata } = pi;
        // Als unbestätigt flaggen für Admin
        await supabase
          .from('bookings')
          .update({ late_fee_payment_intent_id: `FAILED:${pi.id}` })
          .eq('id', metadata.booking_id);
      }
    }
  } catch (err) {
    console.error('Webhook Handler Fehler:', err);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
