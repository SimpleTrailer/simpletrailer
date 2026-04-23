const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { trailer_id, pricing_type, start_time, end_time, customer_name, customer_email, customer_phone, customer_address, insurance_type, insurance_amount, user_id, booking_mode } = req.body;

    if (!trailer_id || !pricing_type || !start_time || !end_time || !customer_name || !customer_email) {
      return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
    }

    const { data: trailer, error: trailerError } = await supabase
      .from('trailers').select('*').eq('id', trailer_id).single();

    if (trailerError || !trailer) return res.status(404).json({ error: 'Anhänger nicht gefunden' });
    if (!trailer.is_available) return res.status(400).json({ error: 'Anhänger ist gerade nicht verfügbar' });

    function calcBaseAmount(start, end) {
      const hours = (new Date(end) - new Date(start)) / 3600000;
      if (hours <= 0) return 0;
      if (hours <= 3)  return 8;
      if (hours <= 6)  return 15;
      // 2h Kulanz pro Tagesgrenze (identisch mit Frontend)
      const extraDays = Math.max(0, Math.ceil((hours - 24 - 2) / 24));
      if (extraDays === 0) return 25;
      return 25 + extraDays * 20;
    }

    let baseAmount;
    if (booking_mode === 'weekend') baseAmount = 59;
    else if (booking_mode === 'week') baseAmount = 119;
    else baseAmount = calcBaseAmount(start_time, end_time);

    if (baseAmount <= 0) return res.status(400).json({ error: 'Ungültiger Zeitraum' });

    const insType   = ['basis','premium'].includes(insurance_type) ? insurance_type : 'none';
    const insRate   = insType === 'basis' ? 0.15 : insType === 'premium' ? 0.30 : 0;
    const insAmount = Math.round(baseAmount * insRate * 100) / 100;
    const amount    = baseAmount + insAmount;
    const amountInCents = Math.round(amount * 100);

    const existing = await stripe.customers.list({ email: customer_email, limit: 1 });
    let customer;
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customer_email, name: customer_name,
        phone: customer_phone || undefined,
        metadata: { source: 'simpletrailer' }
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents, currency: 'eur',
      customer: customer.id,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      receipt_email: customer_email,
      description: `SimpleTrailer – ${trailer.name} – ${pricing_type}`,
      metadata: { trailer_id, pricing_type, start_time, end_time, customer_name, customer_email, customer_phone: customer_phone || '', customer_address: customer_address || '', insurance_type: insType, insurance_amount: String(insAmount), user_id: user_id || '' }
    });

    return res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount, base_amount: baseAmount, insurance_amount: insAmount, insurance_type: insType,
      trailer_name: trailer.name
    });

  } catch (err) {
    console.error('create-payment-intent:', err);
    return res.status(500).json({ error: err.message });
  }
};
