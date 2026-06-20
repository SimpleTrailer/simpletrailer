const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── Rabattcodes (serverseitig = Single Source of Truth) ──────────────────
// percent: Prozent-Rabatt auf den Gesamtbetrag. validUntil: letzter gültiger Moment (inkl., Berlin-Zeit).
const DISCOUNT_CODES = {
  WILLKOMMEN20: { percent: 20, validUntil: '2026-06-25T23:59:59+02:00' },
};
function resolveDiscount(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return { code: null, percent: 0 };
  const def = DISCOUNT_CODES[code];
  if (!def) return { error: 'Code ungültig' };
  if (Date.now() > new Date(def.validUntil).getTime()) return { error: 'Code abgelaufen' };
  return { code, percent: def.percent };
}

const rateLimit = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rateLimit.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 8) return true;
  arr.push(now);
  rateLimit.set(ip, arr);
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { trailer_id, pricing_type, start_time, end_time, customer_name, customer_email, customer_phone, customer_address, insurance_type, insurance_amount, user_id, booking_mode, agb_version, free_floating, cancellation_protection } = req.body;
    // AGB-Akzeptanz fuer Beweissicherung
    const agbAcceptedAt = new Date().toISOString();
    const agbAcceptedIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection?.remoteAddress || '').split(',')[0].trim();

    if (!trailer_id || !pricing_type || !start_time || !end_time || !customer_name || !customer_email) {
      return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
    }

    // AUTH: Identitaet kommt aus der Session, NICHT aus dem Body —
    // sonst koennte jeder beliebige user_ids einsetzen oder anonym
    // Stripe-Customers/PaymentIntents erzeugen.
    const ipForLimit = agbAcceptedIp || 'unknown';
    if (isRateLimited(ipForLimit)) {
      return res.status(429).json({ error: 'Zu viele Versuche — bitte kurz warten.' });
    }
    const authHeader = req.headers.authorization || '';
    const bearer = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!bearer) return res.status(403).json({ error: 'Anmeldung erforderlich' });
    const { data: { user: sessionUser }, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !sessionUser) return res.status(401).json({ error: 'Anmeldung abgelaufen — bitte neu einloggen.' });
    if (user_id && user_id !== sessionUser.id) {
      return res.status(403).json({ error: 'Sitzung passt nicht zum Nutzer.' });
    }
    const effectiveUserId = sessionUser.id;

    // Führerschein-Gate: nur verifizierte User dürfen Zahlung starten
    const { data: { user: licUser } } = await supabase.auth.admin.getUserById(effectiveUserId);
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
      // Wochentarif automatisch: ab 7 Tagen Wochenpreis + Extra-Tage (IDENTISCH zu booking.html calcPrice).
      const totalDays = extraDays + 1;
      let weeks   = Math.floor(totalDays / 7);
      let remDays = totalDays - weeks * 7;
      if (weeks >= 1 && remDays > 0 && remDays * prices.extra_day >= prices.week) { weeks += 1; remDays = 0; }
      const baseDays = weeks === 0
        ? prices.day + extraDays * prices.extra_day
        : weeks * prices.week + remDays * prices.extra_day;
      return baseDays + (remainH > 0 && remainH <= 6 ? remainPrice : 0);
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

    // Free-Floating-Aufpreis: 15€ wenn Mieter im Bremen-Stadtgebiet (statt am Heimat-Stellplatz)
    // abstellen darf. Pauschale, deckt Logistik/Re-Positionierung ab.
    const freeFloating = !!free_floating;
    const freeFloatingFee = freeFloating ? 15.00 : 0;

    // Stornoschutz: 10% vom Mietpreis (NETTO = baseAmount ohne Schutz), min. 3 €, max. 9,90 € (Deckel).
    // Berechnung serverseitig — Client-Wert ist nur Anzeige, der Server ist Single Source of Truth.
    const cancellationProtection = !!cancellation_protection;
    const cancellationProtectionFee = cancellationProtection
      ? Math.min(9.90, Math.max(3.00, Math.round(baseAmount * 0.10 * 100) / 100))
      : 0;

    const amount    = baseAmount + insAmount + freeFloatingFee + cancellationProtectionFee;

    // Rabattcode (optional) — serverseitig validiert + abgezogen.
    // Client-Wert ist NUR Anzeige; hier ist die einzige verbindliche Berechnung.
    const disc = resolveDiscount(req.body.discount_code);
    if (disc.error) return res.status(400).json({ error: `Rabattcode: ${disc.error}` });
    const discountCode    = disc.code || null;
    const discountPercent = disc.percent || 0;
    const discountAmount  = discountPercent ? Math.round(amount * discountPercent) / 100 : 0;
    const finalAmount     = Math.round((amount - discountAmount) * 100) / 100;
    if (finalAmount < 0.50) return res.status(400).json({ error: 'Betrag nach Rabatt zu niedrig.' });

    const amountInCents = Math.round(finalAmount * 100);

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

    // setup_future_usage NUR fuer Karten setzen (PayPal/Klarna/Amazon Pay
    // unterstuetzen das nur teilweise und werden sonst KOMPLETT ausgeblendet).
    // Konsequenz: bei Karte ist Auto-Charge bei Verspaetung/Schaden moeglich,
    // bei anderen Methoden faellt Auto-Charge auf manuelle E-Mail mit
    // Zahlungslink zurueck (process-return.js loggt + Lion-Mail).
    // Im Tausch: Mieter sehen PayPal, Apple Pay, Google Pay, Link als Option.
    const idemBasis = [effectiveUserId, trailer_id, start_time, end_time, insType, booking_mode || '', pricing_type || '', freeFloating ? 1 : 0, cancellationProtection ? 1 : 0, amountInCents, discountCode || '', customer_name || '', customer_email || '', customer_phone || '', customer_address || '', agb_version || ''].join('|');
    const idempotencyKey = 'pi-' + crypto.createHash('sha256').update(idemBasis).digest('hex').slice(0, 40);

    const piParams = {
      amount: amountInCents, currency: 'eur',
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
      payment_method_options: {
        card:   { setup_future_usage: 'off_session' },
        link:   { setup_future_usage: 'off_session' },
        paypal: { setup_future_usage: 'off_session' }
      },
      receipt_email: customer_email,
      description: `SimpleTrailer – ${trailer.name} – ${pricing_type}`,
      metadata: { trailer_id, pricing_type, start_time, end_time, customer_name, customer_email, customer_phone: customer_phone || '', customer_address: customer_address || '', insurance_type: insType, insurance_amount: String(insAmount), user_id: effectiveUserId, agb_version: agb_version || '2026-06-05', free_floating: freeFloating ? '1' : '0', free_floating_fee: String(freeFloatingFee), cancellation_protection: cancellationProtection ? '1' : '0', cancellation_protection_fee: String(cancellationProtectionFee), discount_code: discountCode || '', discount_percent: String(discountPercent), discount_amount: String(discountAmount) }
    };
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey });
    } catch (ppErr) {
      // Sicherheitsnetz: Falls das Stripe-Konto PayPal-Off-Session (noch) nicht unterstützt,
      // darf das NIEMALS den ganzen Checkout kippen → ohne PayPal-SFU erneut (eigener Idempotency-Key).
      if (/paypal|setup_future_usage|payment.?method/i.test(ppErr.message || '')) {
        console.warn('PayPal off_session nicht unterstuetzt — Fallback ohne PayPal-SFU:', ppErr.message);
        delete piParams.payment_method_options.paypal;
        paymentIntent = await stripe.paymentIntents.create(piParams, { idempotencyKey: idempotencyKey + '-nopp' });
      } else {
        throw ppErr;
      }
    }

    // AGB-Zeitstempel/IP NACH dem Create setzen — Updates sind nicht
    // idempotenz-geprueft, so bleibt der Create-Payload fuer denselben Key stabil.
    try {
      await stripe.paymentIntents.update(paymentIntent.id, {
        metadata: { agb_accepted_at: agbAcceptedAt, agb_accepted_ip: agbAcceptedIp }
      });
    } catch (updErr) {
      console.error('PI-Metadata-Update (AGB) fehlgeschlagen:', updErr.message);
    }

    return res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount, base_amount: baseAmount, insurance_amount: insAmount, insurance_type: insType,
      free_floating: freeFloating, free_floating_fee: freeFloatingFee,
      discount_code: discountCode, discount_percent: discountPercent, discount_amount: discountAmount, total_amount: finalAmount,
      trailer_name: trailer.name
    });

  } catch (err) {
    console.error('create-payment-intent:', err);
    if (err && (err.type === 'StripeIdempotencyError' || /idempot/i.test(err.message || ''))) {
      return res.status(409).json({ error: 'Bitte Seite neu laden und erneut versuchen.' });
    }
    return res.status(500).json({ error: err.message });
  }
};
