/**
 * Buchung verlängern — Mieter klickt im Kundenkonto "+1h" oder "+3h" etc.
 * Lädt Off-Session-Charge über die gespeicherte Stripe-PaymentMethod und
 * verlängert die end_time der Buchung.
 *
 * Body: { booking_id: string, extra_hours: number }
 *
 * Logik:
 *  - Auth + Ownership-Check
 *  - Status muss active sein (Pre-Check abgeschlossen)
 *  - Overlap-Check: keine Folge-Buchung im Verlängerungs-Zeitfenster
 *  - Preis aus Trailer-Daten (kurztrip <=3h, halftag <=6h, day <=24h+2 grace)
 *  - Off-Session-Charge mit hinterlegtem PaymentMethod
 *  - end_time updaten, Hinweis-Mail an Mieter
 */
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const { setCors } = require('./_cors');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const T = require('./_email-template');
const _pricing = require('./_pricing'); // gleiche Preis-Engine wie die Buchung

const fmt = d => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Auth
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(auth.replace('Bearer ', ''));
  if (authErr || !user) return res.status(401).json({ error: 'Ungültiger Token' });

  try {
    const { booking_id, extra_hours } = req.body || {};
    if (!booking_id || !extra_hours) return res.status(400).json({ error: 'booking_id + extra_hours erforderlich' });
    const hrs = Number(extra_hours);
    if (!Number.isFinite(hrs) || hrs < 1 || hrs > 48) {
      return res.status(400).json({ error: 'Verlängerung muss zwischen 1 und 48 Stunden liegen.' });
    }

    // Buchung laden
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('*, trailers(*)')
      .eq('id', booking_id)
      .single();
    if (bErr || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
    if (booking.user_id !== user.id && booking.customer_email !== user.email) {
      return res.status(403).json({ error: 'Diese Buchung gehört nicht zu deinem Konto.' });
    }
    if (booking.status !== 'active') {
      return res.status(400).json({ error: 'Buchung ist nicht aktiv — Verlängerung nur während laufender Miete möglich.' });
    }
    if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
      return res.status(400).json({ error: 'Keine hinterlegte Zahlungsmethode — bitte info@simpletrailer.de kontaktieren.' });
    }

    const oldEnd = new Date(booking.end_time).getTime();
    const newEnd = oldEnd + hrs * 3600000;

    // Overlap-Check mit Folge-Buchungen (1h Pufferzeit). Whitelist umgedreht:
    // alles außer returned/cancelled blockt (sicher gegen neue Status-Werte).
    const BUFFER_MS = 60 * 60 * 1000;
    const { data: nextBookings } = await supabase
      .from('bookings')
      .select('start_time, end_time, status')
      .eq('trailer_id', booking.trailer_id)
      .not('status', 'in', '("returned","cancelled")')
      .neq('id', booking.id)
      .gte('end_time', new Date().toISOString());
    const conflict = (nextBookings || []).some(b => {
      const bStart = new Date(b.start_time).getTime();
      return bStart < newEnd + BUFFER_MS && bStart > oldEnd;
    });
    if (conflict) {
      return res.status(400).json({ error: 'Nächste Buchung blockiert die Verlängerung — bitte kürzer wählen oder rechtzeitig zurückgeben.' });
    }

    // Preis ermitteln — gleiche Stundentreppe wie bei der Buchung (RentMyTrailer-Logik):
    // 2h Mindestmiete, je weitere Std +Stundenpreis, ab 8h Tages-Deckel, Mehrtage degressiv.
    const t = booking.trailers || {};
    const extraAmount = _pricing.calcBase(hrs, t);

    // Off-Session-Charge mit Idempotency-Key — schützt vor Doppel-Abbuchung bei Doppelklick.
    // Key basiert auf Booking-ID + bisheriges end_time + Stunden.
    // Erst nach erfolgreicher Verlängerung ändert sich end_time → neuer Key für nächsten Klick.
    // Doppelklick / Retry / paralleler Tab → identischer Key → Stripe gibt denselben PI zurück.
    const idemKey = `ext-${booking.id}-${oldEnd}-${hrs}h`;
    let pi;
    try {
      pi = await stripe.paymentIntents.create({
        amount: Math.round(extraAmount * 100),
        currency: 'eur',
        customer: booking.stripe_customer_id,
        payment_method: booking.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `Verlängerung Buchung #${booking.id.slice(0,8).toUpperCase()} — +${hrs}h`,
        metadata: {
          booking_id: booking.id,
          extension_hours: String(hrs),
          extension_type: 'self_service'
        }
      }, { idempotencyKey: idemKey });
    } catch (chargeErr) {
      // Anonymisiertes Logging — kein PII in Vercel-Logs
      console.error('Stripe extend-charge fehlgeschlagen', {
        code: chargeErr.code, type: chargeErr.type, decline_code: chargeErr.decline_code,
        booking_id: booking.id
      });
      return res.status(402).json({
        error: 'Zahlung fehlgeschlagen — bitte Karte prüfen oder info@simpletrailer.de kontaktieren.',
        decline_code: chargeErr.decline_code || null
      });
    }

    // DB aktualisieren — bei Fehler MUSS automatisch refunded werden,
    // sonst hat der Kunde bezahlt ohne dass die Mietzeit verlängert ist.
    const totalNew = Number(booking.total_amount || 0) + extraAmount;
    const { error: updErr } = await supabase.from('bookings').update({
      end_time: new Date(newEnd).toISOString(),
      total_amount: totalNew
    }).eq('id', booking.id);

    if (updErr) {
      console.error('CRITICAL: extend charge succeeded but DB update failed', {
        booking_id: booking.id, pi: pi.id, err: updErr.message
      });
      // Compensation: Refund
      try {
        await stripe.refunds.create({
          payment_intent: pi.id,
          reason: 'duplicate',
          metadata: { reason_internal: 'db_update_failed', booking_id: booking.id }
        }, { idempotencyKey: `ext-refund-${pi.id}` });
      } catch (refErr) {
        console.error('CRITICAL: compensation-refund failed too', { pi: pi.id, err: refErr.message });
      }
      return res.status(500).json({
        error: 'Verlängerung konnte nicht abgeschlossen werden — Zahlung wurde zurückerstattet.'
      });
    }

    // Bestätigungs-Mail
    try {
      await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: booking.customer_email,
        subject: `Verlängerung +${hrs}h bestätigt — Buchung #${booking.id.slice(0,8).toUpperCase()}`,
        text: `Hi ${booking.customer_name || ''},

deine Mietzeit wurde um ${hrs} Stunde${hrs > 1 ? 'n' : ''} verlängert.

Buchungsnummer: #${booking.id.slice(0,8).toUpperCase()}
Anhänger: ${booking.trailers?.name || 'Anhänger'}
Neues Mietende: ${fmt(new Date(newEnd))} Uhr
Aufpreis: ${extraAmount.toFixed(2).replace('.', ',')} € (bereits abgebucht)

— SimpleTrailer GbR`,
        html: T.layout({
          heading: 'Verlängerung bestätigt ✓',
          preheader: `+${hrs}h · neues Mietende ${fmt(new Date(newEnd))} Uhr`,
          replyNote: 'Fragen? Antworte einfach auf diese Mail.',
          bodyHtml:
            T.p(`Buchung <strong>#${booking.id.slice(0,8).toUpperCase()}</strong> — deine Mietzeit wurde verlängert.`) +
            T.rows([
              ['Anhänger', T.esc(booking.trailers?.name || '—')],
              ['Verlängerung', `+${hrs}h`],
              ['Neues Mietende', `${fmt(new Date(newEnd))} Uhr`],
              ['Aufpreis (abgebucht)', `<span style="color:#E85D00;">${extraAmount.toFixed(2).replace('.', ',')} €</span>`]
            ])
        })
      });
    } catch (mailErr) {
      console.error('Extend-Mail fehlgeschlagen:', mailErr.message);
    }

    return res.status(200).json({
      ok: true,
      new_end_time: new Date(newEnd).toISOString(),
      extra_amount: extraAmount,
      payment_intent: pi.id
    });

  } catch (err) {
    console.error('extend-booking:', err);
    return res.status(500).json({ error: err.message });
  }
};
