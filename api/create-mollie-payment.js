/**
 * Mollie-Zahlung erstellen (Ersatz fuer api/create-payment-intent.js).
 *
 * WICHTIG — Unterschiede zum Stripe-Flow:
 *  - Stripe: PaymentIntent -> client_secret -> Kunde zahlt INLINE auf unserer Seite.
 *  - Mollie: Payment      -> checkoutUrl   -> Kunde wird zu Mollie WEITERGELEITET
 *            und kommt danach auf booking-confirm.html zurueck.
 *  - Der verbindliche Zahlungsstatus kommt NUR ueber den Webhook (api/mollie-webhook.js).
 *    Die Rueckkehr des Browsers ist ein Hinweis, kein Beweis.
 *
 * Die komplette Geschaefts-Logik (Preise, Rabatte, Overlap, Fuehrerschein-Gate)
 * ist 1:1 aus create-payment-intent.js uebernommen — hier wird ausschliesslich
 * der Zahlungsanbieter getauscht.
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { resolveDiscount, isRedeemed } = require('./_discounts');
const { readLicense, writeLicense } = require('./_dl');
const { isLockActive, lockUntilMs } = require('./_booking-lock');
const { mollie } = require('./_mollie');

const SITE_URL = process.env.SITE_URL || 'https://www.simpletrailer.de';

// Konten, die im Mollie-TESTMODUS buchen duerfen (siehe Sperre im Handler).
// Ohne Wirkung, sobald der Live-Schluessel gesetzt ist.
const TESTERS = [
  'lion.grone@hotmail.com',
  'info@simpletrailer.de',
  'byfusionlion@gmail.com'
];

// ZAHLARTEN-AUSWAHL — laeuft ausschliesslich ueber sequenceType 'first' (siehe unten).
//
// Mollie hat KEINEN Parameter zum Ausschliessen einzelner Methoden ("excludedMethods"
// existiert nicht — ein Aufruf damit endet in HTTP 422 und der Kunde kann gar nicht
// bezahlen). Steuern laesst sich die Auswahl nur ueber `method` (Whitelist) oder
// implizit ueber den sequenceType.
//
// Wir brauchen ein Mandat, damit die Verspaetungsgebuehr spaeter ohne Kundeninteraktion
// abgebucht werden kann. Mit sequenceType 'first' zeigt Mollie deshalb von sich aus nur
// Methoden an, die ein Mandat erzeugen koennen. Gegen die echte API geprueft (30.07.2026):
//   angeboten:      Apple Pay, PayPal, Karte
//   faellt weg:     Klarna, Sofortueberweisung/Pay by Bank, Ueberweisung
// Der Wegfall der Ueberweisung ist ohnehin gewollt (1-2 Bankarbeitstage, der Anhaenger
// soll sofort abholbar sein). Klarna ist eine bewusste Abwaegung zugunsten der
// Auto-Nachbelastung.

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
    const {
      trailer_id, pricing_type, start_time, end_time,
      customer_name, customer_email, customer_phone, customer_address,
      insurance_type, user_id, booking_mode, agb_version,
      free_floating, cancellation_protection
    } = req.body;

    const agbAcceptedAt = new Date().toISOString();
    const agbAcceptedIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection?.remoteAddress || '').split(',')[0].trim();

    if (!trailer_id || !pricing_type || !start_time || !end_time || !customer_name || !customer_email) {
      return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
    }

    const ipForLimit = agbAcceptedIp || 'unknown';
    if (isRateLimited(ipForLimit)) {
      return res.status(429).json({ error: 'Zu viele Versuche — bitte kurz warten.' });
    }

    // Temporaere, zeitbasierte Buchungssperre (api/_booking-lock.js). Stand
    // frueher in create-payment-intent.js — die Datei ist mit Stripe weggefallen,
    // der Mechanismus bleibt aber nutzbar: einfach LOCK_UNTIL_ISO setzen.
    // Mietbeginn vor Ablauf der Sperre wird abgelehnt, BEVOR bei Mollie etwas
    // passiert. Slots nach der Freigabe bleiben buchbar.
    if (isLockActive() && new Date(start_time).getTime() < lockUntilMs()) {
      const bis = new Date(lockUntilMs()).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
      });
      return res.status(423).json({ error: `Buchungen sind aktuell pausiert. Ab ${bis} Uhr wieder möglich.` });
    }

    // AUTH: Identitaet aus der Session, nicht aus dem Body.
    const authHeader = req.headers.authorization || '';
    const bearer = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!bearer) return res.status(403).json({ error: 'Anmeldung erforderlich' });
    const { data: { user: sessionUser }, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !sessionUser) return res.status(401).json({ error: 'Anmeldung abgelaufen — bitte neu einloggen.' });
    if (user_id && user_id !== sessionUser.id) {
      return res.status(403).json({ error: 'Sitzung passt nicht zum Nutzer.' });
    }
    const effectiveUserId = sessionUser.id;

    // ── Schutz waehrend der Testphase ────────────────────────────────────────
    // Mit einem Mollie-TEST-Schluessel fliesst kein echtes Geld — der Kunde
    // koennte auf der Test-Bezahlseite trotzdem "Paid" waehlen und bekaeme eine
    // echte Buchung samt Schloss-Code, ohne bezahlt zu haben. Deshalb duerfen im
    // Testmodus nur die eigenen Konten buchen. Sobald der Live-Schluessel
    // hinterlegt ist, greift diese Sperre automatisch nicht mehr — es ist nichts
    // zurueckzubauen.
    if (String(process.env.MOLLIE_API_KEY || '').startsWith('test_')) {
      if (!TESTERS.includes((sessionUser.email || '').toLowerCase())) {
        console.warn('Testmodus: Buchung abgewiesen fuer', sessionUser.email);
        return res.status(503).json({
          error: 'Wir stellen gerade unser Bezahlsystem um — Online-Buchungen sind für ein paar Stunden pausiert. '
               + 'Schreib uns kurz per WhatsApp (0157 5425 5876) oder an info@simpletrailer.de, dann reservieren wir deinen Anhänger persönlich.'
        });
      }
    }

    // Fuehrerschein-Gate: dl_status setzt api/verify-license.js (KI-Pruefung mit
    // Handpruefung im Zweifel). Nur 'verified' darf buchen — 'review' und
    // 'rejected' werden hier bewusst mit abgewiesen.
    //
    // GELESEN WIRD AUS app_metadata (siehe api/_dl.js). NIE aus user_metadata —
    // das kann der Kunde per PUT /auth/v1/user selbst setzen und haette damit das
    // gesamte Gate ausgehebelt.
    const { data: { user: licUser } } = await supabase.auth.admin.getUserById(effectiveUserId);
    const dl = readLicense(licUser);
    if (dl.dl_status !== 'verified') {
      return res.status(403).json({ error: 'Führerschein nicht verifiziert', dl_status: dl.dl_status || 'unverified' });
    }
    // Bestandsschutz: Kunden, die noch ueber Stripe Identity geprueft wurden
    // (kein dl_check_method), haben teils kein dl_expires_at und keine Klassen —
    // Stripe hat das damals nicht immer geliefert. Die duerfen weiter buchen,
    // sonst sperren wir bestehende Kunden aus. Fuer alle NEU geprueften gilt die
    // strenge Regel: ohne Ablaufdatum und ohne Klasse keine Buchung.
    const legacyCheck = !dl.dl_check_method;

    if (dl.dl_expires_at) {
      if (new Date(dl.dl_expires_at) < new Date(end_time)) {
        return res.status(403).json({ error: 'Führerschein läuft vor Mietende ab' });
      }
    } else if (!legacyCheck) {
      return res.status(403).json({ error: 'Das Ablaufdatum deines Führerscheins ist unklar — bitte melde dich kurz bei info@simpletrailer.de.' });
    } else {
      console.warn('Alt-Verifizierung ohne Ablaufdatum, durchgelassen:', effectiveUserId);
    }

    if (Array.isArray(dl.dl_classes) && dl.dl_classes.length > 0) {
      if (!dl.dl_classes.some(c => c === 'B' || c === 'BE')) {
        return res.status(403).json({ error: 'Klasse B oder BE erforderlich' });
      }
    } else if (!legacyCheck) {
      return res.status(403).json({ error: 'Klasse B oder BE erforderlich' });
    }

    // Der Name auf Mietvertrag und Rechnung MUSS der geprüfte Führerschein-Name sein,
    // nicht der frei eingetippte aus dem Browser — sonst laeuft der Vertrag im
    // Streitfall auf eine Person, die nie geprueft wurde.
    const verifiedName = [dl.dl_first_name, dl.dl_last_name].filter(Boolean).join(' ').trim();
    const contractName = verifiedName || String(customer_name || '').trim();

    const { data: trailer, error: trailerError } = await supabase
      .from('trailers').select('*').eq('id', trailer_id).single();
    if (trailerError || !trailer) return res.status(404).json({ error: 'Anhänger nicht gefunden' });

    // Overlap-Check inkl. 1h Pufferzeit (unveraendert).
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

    // ── Preisberechnung: 1:1 identisch zu create-payment-intent.js und
    //    booking.html calcPrice(). Alle drei muessen gleich rechnen.
    const prices = {
      kurztrip:  trailer.price_kurztrip  || 9,
      halftag:   trailer.price_halftag   || 18,
      day:       trailer.price_day       || 29,
      extra_day: trailer.price_extra_day || 24,
      weekend:   trailer.price_weekend   || 59,
      week:      trailer.price_week      || 119,
    };

    const WEEK2_DAY = 14, WEEK3_DAY = 12, WEEK4_DAY = 10;
    function daysPrice(totalDays) {
      if (totalDays <= 7) {
        return Math.min(prices.day + (totalDays - 1) * prices.extra_day, prices.week);
      }
      let sum = prices.week;
      for (let d = 8; d <= totalDays; d++) {
        sum += d <= 14 ? WEEK2_DAY : d <= 21 ? WEEK3_DAY : WEEK4_DAY;
      }
      return sum;
    }

    function calcBaseAmount(start, end) {
      const hours = (new Date(end) - new Date(start)) / 3600000;
      if (hours <= 0)      return 0;
      if (hours <= 3)      return prices.kurztrip;
      if (hours <= 6)      return prices.halftag;
      if (hours <= 24 + 2) return prices.day;
      const extraHours = hours - 24 - 2;
      const fullExtra  = Math.floor(extraHours / 24);
      const remainH    = extraHours % 24;
      let remainPrice  = 0;
      if      (remainH <= 0) remainPrice = 0;
      else if (remainH <= 3) remainPrice = prices.kurztrip;
      else if (remainH <= 6) remainPrice = prices.halftag;
      const extraDays = fullExtra + (remainH > 6 ? 1 : 0);
      const totalDays = extraDays + 1;
      return daysPrice(totalDays) + (remainH > 0 && remainH <= 6 ? remainPrice : 0);
    }

    // ── Festpreis-Tarife: NUR gueltig, wenn die Dauer wirklich dazu passt ────
    // booking_mode kommt aus dem Browser und ist damit frei manipulierbar. Ohne
    // diese Pruefung koennte jemand 30 Tage mit booking_mode 'day' buchen und
    // wuerde statt ~370 EUR nur den Tagespreis von 29 EUR zahlen. Der Server ist
    // die verbindliche Preisinstanz — ein Festpreis gilt nur innerhalb seines
    // Zeitfensters, und in KEINEM Fall weniger als die normale Rechnung ergibt.
    const rentalHours = (new Date(end_time) - new Date(start_time)) / 3600000;
    const MODE_MAX_HOURS = {
      day:      24 + 2,        // 24 h + 2 h Kulanz (wie in calcBaseAmount)
      weekend:  72 + 2,        // Fr-So
      week:     7 * 24 + 2
    };
    if (booking_mode && MODE_MAX_HOURS[booking_mode] !== undefined
        && rentalHours > MODE_MAX_HOURS[booking_mode]) {
      console.warn('Tarif passt nicht zur Dauer', { booking_mode, rentalHours, user: effectiveUserId });
      return res.status(400).json({ error: 'Der gewählte Tarif passt nicht zum Zeitraum. Bitte lade die Seite neu.' });
    }

    const flexAmount = calcBaseAmount(start_time, end_time);
    let baseAmount;
    if (booking_mode === 'weekend')   baseAmount = prices.weekend;
    else if (booking_mode === 'week') baseAmount = prices.week;
    else if (booking_mode === 'day')  baseAmount = prices.day;
    else baseAmount = flexAmount;

    // Sicherheitsnetz: ein Festpreis darf nie GUENSTIGER sein als die regulaere
    // Berechnung fuer denselben Zeitraum. Faengt auch kuenftige Tarif-Fehler ab.
    if (baseAmount < flexAmount) baseAmount = flexAmount;

    if (baseAmount <= 0) return res.status(400).json({ error: 'Ungültiger Zeitraum' });

    const insType   = ['basis','premium'].includes(insurance_type) ? insurance_type : 'none';
    const insRate   = insType === 'basis' ? 0.15 : insType === 'premium' ? 0.30 : 0;
    const insAmount = Math.round(baseAmount * insRate * 100) / 100;

    const freeFloating    = !!free_floating;
    const freeFloatingFee = freeFloating ? 15.00 : 0;

    const cancellationProtection = !!cancellation_protection;
    const cancellationProtectionFee = cancellationProtection
      ? Math.min(9.90, Math.max(3.00, Math.round(baseAmount * 0.10 * 100) / 100))
      : 0;

    const amount = baseAmount + insAmount + freeFloatingFee + cancellationProtectionFee;

    // Rabattcode — serverseitig verbindlich.
    const disc = resolveDiscount(req.body.discount_code);
    if (disc.error) return res.status(400).json({ error: `Rabattcode: ${disc.error}` });
    // Single-Use-Pruefung: laeuft seit dem Anbieterwechsel gegen unsere eigenen
    // Buchungen statt gegen die Stripe-Zahlungshistorie (siehe _discounts.js).
    // Fail-open wie zuvor: ein Fehler in der Pruefung blockiert den Checkout nie.
    if (disc.singleUse && await isRedeemed(supabase, disc.code)) {
      return res.status(400).json({ error: `Rabattcode: Der Code ${disc.code} wurde bereits eingelöst. Wenn das nicht stimmt, schreib uns kurz an info@simpletrailer.de.` });
    }

    const discountCode    = disc.code || null;
    const discountPercent = disc.percent || 0;
    const discountScope   = disc.scope || 'total';
    const discountBasis   = discountScope === 'rent' ? baseAmount : amount;
    const discountAmount  = discountPercent ? Math.round(discountBasis * discountPercent) / 100 : 0;
    const finalAmount     = Math.round((amount - discountAmount) * 100) / 100;
    if (finalAmount < 0.50) return res.status(400).json({ error: 'Betrag nach Rabatt zu niedrig.' });

    // Mollie erwartet den Betrag als String mit exakt 2 Nachkommastellen ("29.00").
    const mollieValue = finalAmount.toFixed(2);

    // ── Mollie-Customer: Voraussetzung fuer das Mandat (Auto-Nachbelastung) ──
    // Die Mollie-Customers-API kann NICHT nach E-Mail suchen — wir muessen die
    // customerId selbst behalten. Sie liegt in app_metadata (siehe api/_dl.js):
    // in user_metadata koennte ein Kunde eine fremde Customer-ID eintragen und
    // sein Mandat damit an ein fremdes Konto haengen.
    let mollieCustomerId = dl.mollie_customer_id || null;
    if (mollieCustomerId) {
      // Verifizieren, dass die gespeicherte ID beim aktuellen Key existiert.
      // Wichtig beim Wechsel Test-Key <-> Live-Key: Test-Kunden existieren im
      // Live-Modus nicht und wuerden sonst bei jeder Buchung einen Fehler werfen.
      try {
        await mollie(`/customers/${mollieCustomerId}`);
      } catch (e) {
        console.warn('Gespeicherte Mollie-Customer-ID ungueltig, lege neu an:', mollieCustomerId);
        mollieCustomerId = null;
      }
    }
    if (!mollieCustomerId) {
      const cust = await mollie('/customers', {
        method: 'POST',
        body: {
          name:  contractName,
          email: customer_email,
          metadata: { user_id: effectiveUserId, source: 'simpletrailer' }
        }
      });
      mollieCustomerId = cust.id;
      try {
        await writeLicense(supabase, licUser, { mollie_customer_id: mollieCustomerId });
      } catch (e) {
        // Nicht blockierend: die ID steht auch in den Payment-Metadaten und laesst
        // sich im Webhook nachtragen.
        console.error('mollie_customer_id konnte nicht gespeichert werden:', e.message);
      }
    }

    // Idempotenz: derselbe Warenkorb desselben Nutzers erzeugt denselben Key,
    // damit Doppelklicks nicht zwei Zahlungen anlegen.
    const idemBasis = [
      effectiveUserId, trailer_id, start_time, end_time, insType,
      booking_mode || '', pricing_type || '', freeFloating ? 1 : 0,
      cancellationProtection ? 1 : 0, mollieValue, discountCode || ''
    ].join('|');
    const idempotencyKey = 'mol1-' + crypto.createHash('sha256').update(idemBasis).digest('hex').slice(0, 40);

    // Metadata: Mollie erlaubt bis zu 1 kB. Alles, was der Webhook zum Anlegen
    // der Buchung braucht, muss hier rein.
    const metadata = {
      trailer_id, pricing_type, start_time, end_time,
      // geprüfter Führerschein-Name, nicht der frei eingetippte (siehe oben)
      customer_name: contractName,
      customer_email,
      customer_phone:   customer_phone   || '',
      customer_address: customer_address || '',
      insurance_type:   insType,
      insurance_amount: String(insAmount),
      user_id:          effectiveUserId,
      agb_version:      agb_version || '2026-06-05',
      agb_accepted_at:  agbAcceptedAt,
      agb_accepted_ip:  agbAcceptedIp,
      free_floating:              freeFloating ? '1' : '0',
      free_floating_fee:          String(freeFloatingFee),
      cancellation_protection:     cancellationProtection ? '1' : '0',
      cancellation_protection_fee: String(cancellationProtectionFee),
      discount_code:    discountCode || '',
      discount_percent: String(discountPercent),
      discount_scope:   discountScope,
      discount_amount:  String(discountAmount),
      mollie_customer_id: mollieCustomerId
    };

    const paymentBody = {
        amount:      { currency: 'EUR', value: mollieValue },
        description: `SimpleTrailer – ${trailer.name} – ${pricing_type}`,
        // cleanUrls ist an — ohne ".html", sonst ein 308-Hop mehr fuer den Kunden.
        redirectUrl: `${SITE_URL}/booking-confirm?provider=mollie`,
        // Der Webhook ist die einzige verbindliche Statusquelle. Ohne ihn wuerde
        // eine Zahlung, bei der der Kunde den Browser schliesst, nie ankommen.
        webhookUrl:  `${SITE_URL}/api/mollie-webhook`,
        metadata,
        locale: 'de_DE',
        billingEmail: customer_email,
        // customerId + sequenceType 'first' erzeugen ein Mandat, mit dem wir spaeter
        // die Verspaetungsgebuehr per sequenceType 'recurring' abbuchen koennen —
        // ohne dass der Kunde erneut etwas bestaetigen muss. Das begrenzt zugleich
        // die angezeigten Zahlarten (siehe Kommentar oben) — einen expliziten
        // Ausschluss-Parameter gibt es bei Mollie nicht.
        customerId:   mollieCustomerId,
        sequenceType: 'first'
    };

    let payment = await mollie('/payments', { method: 'POST', idempotencyKey, body: paymentBody });

    // ── Wiederholung nach Abbruch ────────────────────────────────────────────
    // Der Idempotenz-Schluessel haengt nur am Warenkorb. Bricht der Kunde bei
    // Mollie ab und klickt danach erneut auf "Bezahlen", liefert Mollie innerhalb
    // des Key-Fensters (~1 h) DIESELBE, bereits verbrannte Zahlung zurueck — der
    // Kunde landet auf einer toten Bezahlseite und kommt nicht mehr weiter.
    if (['canceled', 'expired', 'failed'].includes(payment.status)) {
      console.log(`Vorherige Zahlung ${payment.id} war ${payment.status} — neuer Versuch.`);
      payment = await mollie('/payments', {
        method: 'POST',
        idempotencyKey: `${idempotencyKey}-r${Math.floor(Date.now() / 300000)}`,  // 5-Minuten-Fenster
        body: paymentBody
      });
    }

    // Bereits bezahlt (Doppelklick nach erfolgreicher Zahlung): NICHT erneut zur
    // Bezahlseite schicken, sondern direkt zur Bestaetigung.
    if (payment.status === 'paid') {
      return res.status(200).json({
        provider: 'mollie',
        payment_id: payment.id,
        already_paid: true,
        checkout_url: `${SITE_URL}/booking-confirm?provider=mollie`
      });
    }

    const checkoutUrl = payment?._links?.checkout?.href;
    if (!checkoutUrl) {
      console.error('Mollie-Antwort ohne checkout-Link:', JSON.stringify(payment).slice(0, 500));
      return res.status(502).json({ error: 'Zahlung konnte nicht gestartet werden. Bitte erneut versuchen.' });
    }

    return res.status(200).json({
      provider: 'mollie',
      payment_id:   payment.id,          // "tr_..."
      customer_id:  mollieCustomerId,    // "cst_..."
      checkout_url: checkoutUrl,         // hierhin wird der Kunde weitergeleitet
      amount, base_amount: baseAmount,
      insurance_amount: insAmount, insurance_type: insType,
      free_floating: freeFloating, free_floating_fee: freeFloatingFee,
      cancellation_protection: cancellationProtection,
      cancellation_protection_fee: cancellationProtectionFee,
      discount_code: discountCode, discount_percent: discountPercent,
      discount_scope: discountScope, discount_amount: discountAmount,
      total_amount: finalAmount,
      trailer_name: trailer.name
    });

  } catch (err) {
    console.error('create-mollie-payment:', err.message, err.mollie || '');
    return res.status(err.status && err.status < 500 ? 400 : 500).json({
      error: err.message || 'Zahlung konnte nicht gestartet werden.'
    });
  }
};
