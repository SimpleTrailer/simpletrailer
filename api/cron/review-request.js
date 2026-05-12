/**
 * SimpleTrailer Cron: Review-Request-Mail
 *
 * Läuft täglich 10:00 Berlin (08:00 UTC) via Vercel Cron.
 * Schickt automatisch eine Bewertungs-Bitte an Kunden, deren Rückgabe
 * 24h–7 Tage her ist UND die noch keine Mail bekommen haben (Spalte
 * `review_request_sent_at` IS NULL).
 *
 * Migration: supabase-migration-review-request.sql muss vorher laufen.
 * Wenn Spalte fehlt: Cron aborted sauber mit Warnung — keine doppelten Mails.
 *
 * Auth: Bearer CRON_SECRET (gleicher Mechanismus wie alle anderen Crons).
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Platzhalter — sobald GBP-Place-ID da, hier einsetzen (auch in process-return.js).
// Bis dahin: leerer Link → "Auf Google bewerten" wird zur Startseite mit Anker.
const GBP_REVIEW_URL = 'https://search.google.com/local/writereview?placeid=ChIJ';

module.exports = async (req, res) => {
  // Auth — wie alle Crons
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now      = new Date();
    const since    = new Date(now.getTime() - 7 * 86400000).toISOString();  // 7 Tage zurück
    const until    = new Date(now.getTime() - 24 * 3600000).toISOString();   // bis 24h zurück

    // Kandidaten: returned + 24h–7d alt + noch keine Review-Mail + nicht anonymisiert
    let candidates, error;
    try {
      const r = await supabase.from('bookings')
        .select('id, customer_email, customer_name, trailers(name), actual_return_time, late_fee_amount, return_status')
        .eq('status', 'returned')
        .is('review_request_sent_at', null)
        .gte('actual_return_time', since)
        .lte('actual_return_time', until)
        .not('customer_email', 'like', 'deleted+%@simpletrailer.de')  // anonymisierte Accounts skippen
        .limit(50);
      candidates = r.data;
      error = r.error;
    } catch (e) { error = e; }

    if (error && /column .* does not exist/i.test(error.message || '')) {
      console.warn('review_request_sent_at-Spalte fehlt. Bitte supabase-migration-review-request.sql ausführen.');
      return res.status(200).json({ ok: true, skipped: 'migration_missing', sent: 0 });
    }
    if (error) throw error;

    const list = candidates || [];
    if (!list.length) {
      return res.status(200).json({ ok: true, sent: 0, checked: 0 });
    }

    let sent = 0;
    const failed = [];

    for (const b of list) {
      // Wenn der Mieter zu spät war oder Fehlrückgabe-Pauschale fällig wurde,
      // überspringen — schlechte Erfahrung, keine Review-Bitte.
      const hadFriction = (b.late_fee_amount || 0) > 0
                       || b.return_status === 'wrong_spot_in_bremen'
                       || b.return_status === 'outside_bremen';
      if (hadFriction) {
        // Trotzdem als "gesendet" markieren damit wir es nicht erneut prüfen
        try {
          await supabase.from('bookings')
            .update({ review_request_sent_at: now.toISOString() })
            .eq('id', b.id);
        } catch (e) { /* ignore */ }
        continue;
      }

      const trailerName = b.trailers?.name || 'Anhänger';
      const firstName = (b.customer_name || '').split(' ')[0] || 'Hallo';

      // Atomares Pre-Update: review_request_sent_at von null auf jetzt setzen.
      // Wenn 0 Rows zurückkommen, hat ein paralleler Cron-Lauf den Kandidat schon
      // abgegriffen — wir skippen sauber statt doppelte Mail zu senden.
      const { data: locked } = await supabase.from('bookings')
        .update({ review_request_sent_at: now.toISOString() })
        .eq('id', b.id)
        .is('review_request_sent_at', null)
        .select('id');
      if (!locked || locked.length === 0) continue;

      try {
        await resend.emails.send({
          from: 'SimpleTrailer <buchung@simpletrailer.de>',
          reply_to: 'info@simpletrailer.de',
          to: b.customer_email,
          subject: `Wie war deine Erfahrung, ${firstName}? – SimpleTrailer`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
            <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
              </div>
              <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;text-align:center;">
                <div style="font-size:1.6rem;margin-bottom:10px;">⭐⭐⭐⭐⭐</div>
                <h1 style="margin:0 0 12px;font-size:1.3rem;">Hi ${firstName} 👋</h1>
                <p style="color:#ccc;font-size:.95rem;margin:0 0 18px;line-height:1.6;">
                  vor ein paar Tagen hast du den ${trailerName} bei uns gemietet. Wir hoffen alles hat geklappt!
                </p>
                <p style="color:#aaa;font-size:.88rem;margin:0 0 24px;line-height:1.6;">
                  Magst du uns kurz auf Google bewerten? Eine kurze Bewertung hilft uns als kleinem Bremer Start-up enorm — und anderen, uns zu finden.
                </p>
                <a href="${GBP_REVIEW_URL}" target="_blank"
                   style="display:inline-block;background:#E85D00;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:.95rem;">
                  Jetzt auf Google bewerten →
                </a>
                <p style="color:#666;font-size:.78rem;margin:18px 0 0;line-height:1.5;">
                  Dauert weniger als 30 Sekunden. Danke!<br>
                  – Lion &amp; Samuel
                </p>
              </div>
              <p style="color:#444;font-size:.72rem;text-align:center;margin-top:20px;">
                Du bekommst diese Mail einmalig nach deiner Buchung. Antwort an info@simpletrailer.de wenn etwas nicht passte.
              </p>
            </div>
          </body></html>`
        });

        sent++;
      } catch (mailErr) {
        // Mail fehlgeschlagen — Lock wieder freigeben, damit nächster Cron retried.
        try {
          await supabase.from('bookings')
            .update({ review_request_sent_at: null })
            .eq('id', b.id);
        } catch (e) { /* ignore */ }
        console.error('review-request mail fehlgeschlagen für', b.id, mailErr.message);
        failed.push({ id: b.id, error: mailErr.message });
      }
    }

    return res.status(200).json({ ok: true, sent, checked: list.length, failed });
  } catch (err) {
    console.error('review-request cron:', err);
    return res.status(500).json({ error: err.message });
  }
};
