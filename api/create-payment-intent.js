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

    // Führerschein-Gate: nur verifizierte User dürfen Zahlung starten
    if (!user_id) {
      return res.status(403).json({ error: 'Anmeldung erforderlich' });
    }
    const { data: { user: licUser } } = await supabase.auth.admin.getUserById(user_id);
    const dl = licUser?.user_metadata || {};
    if (dl.dl_status !== 'verified') {
      return res.status(403).json({ error: 'Führerschein nicht verifiziert', dl_status: dl.dl_status || 'unverified' });
    }
    if (dl.dl_expires_at && new Date(dl.dl_expires_at) < new Date(end_time)) {
      return res.status(403).json({ error: 'Führerschein läuft vor Mietende ab' });
    }
    if (Array.isArray(dl.dl_classes) && !dl.dl_classes.some(c => c === 'B' || c === 'BE')) {
      return res.status(403).json({ error: 'Klasse B oder BE erforderlich' });
    }

    const { data: trailer, error: trailerError } = await supabase
      .from('trailers').select('*').eq('id', trailer_id).single();

    if (trailerError || !trailer) return res.status(404).json({ error: 'Anhänger nicht gefunden' });

    // Overlap-Check inkl. 1h Pufferzeit nach jeder bestehenden Buchung
    const BUFFER_MS = 60 * 60 * 1000;
    const { data: existing_bookings } = await supabase
      .from('bookings').select('start_time, end_time')
      .eq('trailer_id', trailer_id).in('status', ['confirmed', 'active']);
    const newStart = new Date(start_time).getTime();
    const newEnd   = new Date(end_time).getTime();
    const overlap = (existing_bookings || []).some(b => {
      const bStart = new Date(b.start_time).getTime();
      const bEnd   = new Date(b.end_time).getTime() + BUFFER_MS;
      return bStart < newEnd && bEnd > newStart;
    });
    if (overlap) return res.status(400).json({ error: 'Anhänger ist in diesem Zeitraum (inkl. Pufferzeit) bereits gebucht' });

    // Preise aus Supabase laden (pro Anhänger unterschiedlich)
    const prices = {
      kurztrip:  trailer.price_kurztrip  || 9,
      halftag:   trailer.price_halftag   || 18,
      day:       trailer.price_day       || 29,
      extra_day: trailer.price_extra_day || 24,
      weekend:   trailer.price_weekend   || 59,
      week:      trailer.price_week      || 119,
    };

    function calcBaseAmount(start, end) {
      const hours = (new Date(end) - new Date(start)) / 3600000;
      if (hours <= 0)      return 0;
      if (hours <= 3)      return prices.kurztrip;
      if (hours <= 6)      return prices.halftag;
      if (hours <= 24 + 2) return prices.day;
      // Mehr als 26h: erster Tag + volle Extra-Tage + Restzeitstaffel
      const extraHours = hours - 24 - 2;
      const fullExtra  = Math.floor(extraHours / 24);
      const remainH    = extraHours % 24;
      let remainPrice  = 0;
      if      (remainH <= 0) remainPrice = 0;
      else if (remainH <= 3) remainPrice = prices.kurztrip;
      else if (remainH <= 6) remainPrice = prices.halftag;
      else                   remainPrice = prices.extra_day;
      const extraDays = fullExtra + (remainH > 6 ? 1 : 0);
      return prices.day + extraDays * prices.extra_day + (remainH > 0 && remainH <= 6 ? remainPrice : 0);
    }

    let baseAmount;
    if (booking_mode === 'weekend') baseAmount = prices.weekend;
    else if (booking_mode === 'week') baseAmount = prices.week;
    else if (booking_mode === 'day')  baseAmount = prices.day;
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
