/**
 * SimpleTrailer — Dokument-Download (Mietvertrag / Rechnung)
 *
 * Erlaubt eingeloggten Kunden, ihren Mietvertrag oder ihre Rechnung jederzeit
 * im Konto erneut herunterzuladen — auch wenn die Bestätigungs-Mail nie ankam
 * (Tippfehler in der Adresse o.ä.). Schließt damit die Lücke "falsche Mail =
 * Vertrag/Rechnung weg".
 *
 * READ-ONLY: erzeugt das PDF frisch aus der gespeicherten Buchung über die
 * vorhandenen Vorlagen (_pdf-templates.js). Fasst das Live-Buchungssystem NICHT
 * an. Eigentum wird wie in /api/get-user-bookings über die E-Mail geprüft —
 * ein Kunde kommt nur an SEINE eigene Buchung.
 *
 * Hinweis: Rabatt- und Flexrückgabe-Gebühr sind keine eigenen DB-Spalten und
 * werden in die Mietzeile eingerechnet — die ausgewiesene GESAMTSUMME stimmt
 * immer exakt (= total_amount).
 *
 * Aufruf: GET /api/get-document?booking_id=<uuid>&type=mietvertrag|rechnung
 *         Header: Authorization: Bearer <supabase access_token>
 */
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { setCors } = require('./_cors');
const { generateMietvertrag, generateRechnung } = require('./_pdf-templates.js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const INS_LABELS = { none: 'Ohne Schutzpaket', basis: 'Basis-Schutz (500 € SB)', premium: 'Premium-Schutz (50 € SB)' };
const TARIFF_LABELS = { '3h': '3 Stunden', '6h': '6 Stunden', day: 'Ganzer Tag', weekend: 'Wochenende (Fr-So)', week: '1 Woche', flexible: 'Individuell' };

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });
  const token = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Ungültiger Token' });

  const bookingId = String(req.query.booking_id || req.query.id || '').trim();
  const docType   = String(req.query.type || 'mietvertrag').toLowerCase() === 'rechnung' ? 'rechnung' : 'mietvertrag';
  if (!bookingId) return res.status(400).json({ error: 'booking_id fehlt' });

  try {
    // Eigentums-Prüfung: nur die EIGENE Buchung (Match über E-Mail wie get-user-bookings).
    const { data: b, error } = await supabase
      .from('bookings')
      .select('*, trailers(name, license_plate)')
      .eq('id', bookingId)
      .eq('customer_email', user.email)
      .maybeSingle();
    if (error) throw error;
    if (!b) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    // Finanz-Teil bevorzugt EXAKT aus den Stripe-PI-Metadaten rekonstruieren (genau die
    // Quelle, aus der booking.js beim Kauf das PDF erzeugt hat) → die erneut geladene
    // Rechnung ist deckungsgleich mit der Original-Mail-Rechnung (inkl. Rabatt-/Flex-Posten),
    // gleiche Rechnungsnummer = gleicher Beleg. Fällt Stripe aus, greift der DB-Fallback.
    let meta = null, payMethod = 'card', amount = parseFloat(b.total_amount || 0) || 0;
    if (b.stripe_payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(b.stripe_payment_intent_id);
        meta = pi.metadata || {};
        if (typeof pi.amount === 'number') amount = pi.amount / 100;
        payMethod = (pi.payment_method_types && pi.payment_method_types[0]) || 'card';
      } catch (e) {
        console.warn('get-document: Stripe-PI nicht abrufbar, DB-Fallback:', e.message);
      }
    }

    let items, insType, insuranceLabel, cancellationLabel, returnModeLabel, tariffLabel;
    if (meta) {
      // 1:1 wie api/booking.js
      insType = meta.insurance_type || 'none';
      const insAmount = parseFloat(meta.insurance_amount || '0') || 0;
      const cancFee = parseFloat(meta.cancellation_protection_fee || '0') || 0;
      const freeFloatingFee = parseFloat(meta.free_floating_fee || '0') || 0;
      const discountAmount = parseFloat(meta.discount_amount || '0') || 0;
      const discountCode = meta.discount_code || '';
      const discountPercent = parseFloat(meta.discount_percent || '0') || 0;
      const discountScope = meta.discount_scope || 'total';
      const ptype = meta.pricing_type || b.pricing_type;
      const baseAmount = Math.max(0, amount - insAmount - cancFee - freeFloatingFee + discountAmount);
      tariffLabel = TARIFF_LABELS[ptype] || ptype;
      items = [{ label: `Anhängermiete · ${tariffLabel}`, gross: baseAmount }];
      if (insAmount > 0) items.push({ label: insType === 'basis' ? 'Basis-Schutz (Selbstbeteiligung 500 €)' : 'Premium-Schutz (Selbstbeteiligung 50 €)', gross: insAmount });
      if (cancFee > 0) items.push({ label: 'Kostenlose Stornierung (Storno bis zum Mietbeginn)', gross: cancFee });
      if (freeFloatingFee > 0) items.push({ label: 'Rückgabe egal-wo in Bremen (Flexrückgabe)', gross: freeFloatingFee });
      if (discountAmount > 0) items.push({ label: `Rabatt ${discountCode}${discountScope === 'rent' ? ' (nur auf Miete)' : ''} -${discountPercent} %`, gross: -discountAmount });
      insuranceLabel = INS_LABELS[insType];
      cancellationLabel = (meta.cancellation_protection === '1')
        ? `Aktiv (${cancFee.toFixed(2).replace('.', ',')} €) — Storno bis zum Mietbeginn`
        : 'Nicht gebucht — 90 % Storno-Gebühr (AGB § 6)';
      returnModeLabel = (meta.free_floating === '1') ? 'Bremen-Stadtgebiet (Flexrückgabe)' : 'Zurück zum Heimat-Stellplatz';
    } else {
      // DB-Fallback: Posten-Summe == total_amount; Rabatt/Flex sind in die Mietzeile gefaltet.
      insType = b.insurance_type || 'none';
      const insAmount = parseFloat(b.insurance_amount || 0) || 0;
      const cancFee = parseFloat(b.cancellation_protection_fee || 0) || 0;
      const baseAmount = Math.max(0, amount - insAmount - cancFee);
      tariffLabel = TARIFF_LABELS[b.pricing_type] || b.pricing_type;
      items = [{ label: `Anhängermiete · ${tariffLabel}${b.free_floating ? ' (inkl. Flexrückgabe)' : ''}`, gross: baseAmount }];
      if (insAmount > 0) items.push({ label: insType === 'basis' ? 'Basis-Schutz (Selbstbeteiligung 500 €)' : 'Premium-Schutz (Selbstbeteiligung 50 €)', gross: insAmount });
      if (cancFee > 0) items.push({ label: 'Kostenlose Stornierung (Storno bis zum Mietbeginn)', gross: cancFee });
      insuranceLabel = INS_LABELS[insType];
      cancellationLabel = b.cancellation_protection
        ? `Aktiv (${cancFee.toFixed(2).replace('.', ',')} €) — Storno bis zum Mietbeginn`
        : 'Nicht gebucht — 90 % Storno-Gebühr (AGB § 6)';
      returnModeLabel = b.free_floating ? 'Bremen-Stadtgebiet (Flexrückgabe)' : 'Zurück zum Heimat-Stellplatz';
    }

    const payload = {
      bookingShort:    String(b.id).slice(0, 8).toUpperCase(),
      contractDate:    b.created_at || new Date().toISOString(),
      customerName:    b.customer_name,
      customerEmail:   b.customer_email,
      customerPhone:   b.customer_phone,
      customerAddress: b.customer_address,
      trailerName:     b.trailers?.name || 'PKW-Anhänger',
      licensePlate:    b.trailers?.license_plate || '–',
      tariffLabel,
      startTime:       b.start_time,
      endTime:         b.end_time,
      insuranceLabel,
      cancellationLabel,
      accessCode:      b.access_code,
      returnModeLabel,
      agbVersion:      b.agb_version || '2026-06-05',
      paymentMethod:   payMethod,
      items
    };

    const pdf = docType === 'rechnung'
      ? await generateRechnung(payload)
      : await generateMietvertrag(payload);

    const safeShort = payload.bookingShort.replace(/[^A-Z0-9]/g, '');
    const fname = `${docType === 'rechnung' ? 'Rechnung' : 'Mietvertrag'}-${safeShort}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(pdf);
  } catch (err) {
    console.error('get-document:', err.message);
    return res.status(500).json({ error: 'Dokument konnte nicht erzeugt werden' });
  }
};
