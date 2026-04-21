const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { trailer_id, pricing_type, start_time, end_time, customer_name, customer_email, customer_phone } = JSON.parse(event.body);

    if (!trailer_id || !pricing_type || !start_time || !end_time || !customer_name || !customer_email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Fehlende Pflichtfelder' }) };
    }

    // Anhänger aus Supabase laden
    const { data: trailer, error: trailerError } = await supabase
      .from('trailers')
      .select('*')
      .eq('id', trailer_id)
      .single();

    if (trailerError || !trailer) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Anhänger nicht gefunden' }) };
    }

    if (!trailer.is_available) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Anhänger ist gerade nicht verfügbar' }) };
    }

    // Preis berechnen
    let amount;
    if (pricing_type === '3h')      amount = trailer.price_3h;
    else if (pricing_type === 'day') amount = trailer.price_day;
    else if (pricing_type === 'weekend') amount = trailer.price_weekend;
    else return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ungültiger Tarif' }) };

    const amountInCents = Math.round(amount * 100);

    // Stripe Customer anlegen oder vorhandenen nehmen
    const existing = await stripe.customers.list({ email: customer_email, limit: 1 });
    let customer;
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customer_email,
        name: customer_name,
        phone: customer_phone || undefined,
        metadata: { source: 'simpletrailer' }
      });
    }

    // PaymentIntent erstellen – Karte für spätere Aufpreise speichern
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      customer: customer.id,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      receipt_email: customer_email,
      description: `SimpleTrailer – ${trailer.name} – ${pricing_type}`,
      metadata: {
        trailer_id,
        pricing_type,
        start_time,
        end_time,
        customer_name,
        customer_email,
        customer_phone: customer_phone || ''
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount,
        trailer_name: trailer.name
      })
    };

  } catch (err) {
    console.error('create-payment-intent:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
