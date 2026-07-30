/**
 * Buchung verlängern — Mieter klickt im Kundenkonto "+1h" oder "+3h" etc.
 * Belastet den Zusatzbetrag über das bei der Buchung erteilte Mollie-Mandat nach
 * (api/_charge.js) und verlängert die end_time der Buchung.
 *
 * Body: { booking_id: string, extra_hours: number }
 *
 * Logik:
 *  - Auth + Ownership-Check
 *  - Status muss active sein (Pre-Check abgeschlossen)
 *  - Overlap-Check: keine Folge-Buchung im Verlängerungs-Zeitfenster
 *  - Preis aus Trailer-Daten (kurztrip <=3h, halftag <=6h, day <=24h+2 grace)
 *  - Nachbelastung über das hinterlegte Zahlungs-Mandat
 *  - end_time updaten, Hinweis-Mail an Mieter
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { setCors } = require('./_cors');
const { chargeStored, refundPayment } = require('./_charge');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const T = require('./_email-template');

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
    if (!booking.stripe_customer_id) {
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

    // Preis ermitteln
    const t = booking.trailers || {};
    const prices = {
      kurztrip:  Number(t.price_kurztrip)  || 9,
      halftag:   Number(t.price_halftag)   || 18,
      day:       Number(t.price_day)       || 29,
      extra_day: Number(t.price_extra_day) || 24,
    };
    let extraAmount;
    if (hrs <= 3)       extraAmount = prices.kurztrip;
    else if (hrs <= 6)  extraAmount = prices.halftag;
    else if (hrs <= 24) extraAmount = prices.day;
    else                extraAmount = prices.day + Math.ceil((hrs - 24) / 24) * prices.extra_day;

    // Nachbelastung über das hinterlegte Mandat (api/_charge.js).
    // Der Idempotency-Key dort basiert auf Buchung + Anlass + Betrag; zusätzlich
    // schützt der Overlap-Check oben davor, dieselbe Stunde zweimal zu kaufen.
    const charge = await chargeStored({
      booking,
      amount:      extraAmount,
      type:        'extension',
      description: `Verlängerung Buchung #${booking.id.slice(0,8).toUpperCase()} — +${hrs}h`,
      // Die ALTE Endzeit macht jede Verlängerung eindeutig. Ohne sie hätte eine
      // zweite Verlängerung um dieselbe Stundenzahl denselben Idempotenz-Schlüssel
      // wie die erste — Mollie würde nicht erneut abbuchen und der Mieter bekäme
      // die zweite Verlängerung geschenkt.
      occasion: String(oldEnd),
      extraMetadata: { extension_hours: String(hrs), extension_type: 'self_service' }
    });

    if (!charge.ok) {
      // Anonymisiertes Logging — kein PII in Vercel-Logs
      console.error('extend-charge fehlgeschlagen', { booking_id: booking.id, reason: charge.error });
      return res.status(402).json({
        error: 'Zahlung fehlgeschlagen — bitte Zahlungsmethode prüfen oder info@simpletrailer.de kontaktieren.'
      });
    }
    const pi = { id: charge.id };

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
      // Compensation: Refund versuchen. ACHTUNG — bei Mollie startet eine
      // Nachbelastung als 'open' und kann in diesem Moment noch gar nicht
      // erstattet werden. Der Refund schlaegt hier also HAEUFIG fehl; dann muss
      // Lion es von Hand erledigen und darf davon nicht nur im Log erfahren.
      const back = await refundPayment(pi.id, {
        description: 'SimpleTrailer — Verlängerung nicht zustande gekommen',
        idempotencyKey: `ext-refund-${pi.id}`
      });
      if (!back.ok) {
        console.error('CRITICAL: compensation-refund failed too', { payment: pi.id, err: back.error });
        try {
          await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: 'info@simpletrailer.de',
            subject: `🚨 MANUELL ERSTATTEN: ${extraAmount.toFixed(2)} € — Verlängerung fehlgeschlagen #${booking.id.slice(0,8).toUpperCase()}`,
            text: `Eine Verlängerung wurde abgebucht, konnte aber nicht eingetragen werden. Die automatische Erstattung hat NICHT funktioniert.\n\nKunde:   ${booking.customer_name} (${booking.customer_email})\nBuchung: #${booking.id.slice(0,8).toUpperCase()}\nBetrag:  ${extraAmount.toFixed(2)} €\nZahlung: ${pi.id}\nGrund:   ${back.error}\n\nBitte im Mollie-Dashboard erstatten, sobald die Zahlung auf 'paid' steht:\nhttps://my.mollie.com/dashboard/payments/${pi.id}`
          });
        } catch (e) { console.error('Alarm-Mail (extend-refund):', e.message); }
      }
      // Ehrlich formulieren: wir wissen an dieser Stelle NICHT sicher, ob schon
      // erstattet wurde. Nichts behaupten, was womöglich nicht stimmt.
      return res.status(500).json({
        error: back.ok
          ? 'Verlängerung konnte nicht abgeschlossen werden — deine Zahlung wurde zurückerstattet.'
          : 'Verlängerung konnte nicht abgeschlossen werden. Falls bereits abgebucht wurde, erstatten wir umgehend — wir melden uns bei dir.'
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
