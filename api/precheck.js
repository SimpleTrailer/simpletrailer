const { createClient } = require('@supabase/supabase-js');
const { setCors } = require('./_cors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { id, token } = req.query;
    if (!id || !token) return res.status(400).json({ error: 'Fehlende Parameter' });

    try {
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('id, customer_name, start_time, end_time, pricing_type, total_amount, insurance_type, precheck_completed_at, status, precheck_token, trailer_id, trailers(name)')
        .eq('id', id)
        .eq('precheck_token', token)
        .single();

      if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
      // Trailer-Name flach in Response damit Frontend einfach drauf zugreifen kann
      booking.trailer_name = booking.trailers?.name || null;
      delete booking.trailers;
      return res.status(200).json({ booking });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { booking_id, precheck_token, photo_url, photo_url_inside, ai_override } = req.body;
      if (!booking_id || !precheck_token) {
        return res.status(400).json({ error: 'Fehlende Parameter' });
      }

      const { data: booking, error } = await supabase
        .from('bookings')
        .select('id, status, access_code, precheck_token, precheck_completed_at, customer_name, start_time, end_time')
        .eq('id', booking_id)
        .eq('precheck_token', precheck_token)
        .single();

      if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
      if (booking.status === 'returned') return res.status(400).json({ error: 'Buchung bereits abgeschlossen' });

      // Schloss-Code darf erst ab 15 Min vor offiziellem Mietbeginn freigeschaltet werden.
      // So bekommt niemand Codes für Buchungen die noch Tage in der Zukunft liegen.
      const PRECHECK_WINDOW_MS = 15 * 60 * 1000;
      const startMs = new Date(booking.start_time).getTime();
      const nowMs   = Date.now();
      if (nowMs < startMs - PRECHECK_WINDOW_MS) {
        return res.status(403).json({
          error: 'too_early',
          message: 'Der Pre-Check ist erst ab 15 Minuten vor Mietbeginn möglich.',
          start_time: booking.start_time,
          seconds_until_unlock: Math.ceil((startMs - PRECHECK_WINDOW_MS - nowMs) / 1000)
        });
      }

      if (booking.precheck_completed_at) {
        return res.status(200).json({ access_code: booking.access_code, already_done: true });
      }

      // Atomic Update: nur wenn precheck_completed_at noch NULL — schützt vor Race bei Doppelklick.
      // Bei fehlender precheck_photo_url_inside-Spalte (Migration ausstehend) fallback auf minimal.
      const updatePayload = {
        status: 'active',
        precheck_photo_url: photo_url || null,
        precheck_photo_url_inside: photo_url_inside || null,
        precheck_ai_override: !!ai_override,
        precheck_completed_at: new Date().toISOString()
      };
      let { data: updated, error: updErr } = await supabase
        .from('bookings').update(updatePayload)
        .eq('id', booking_id).is('precheck_completed_at', null)
        .select('id').maybeSingle();
      // Falls Migration (precheck_photo_url_inside oder precheck_ai_override) noch fehlt — graceful Fallback
      if (updErr && /column .* does not exist/i.test(updErr.message || '')) {
        const { precheck_photo_url_inside, precheck_ai_override, ...minimal } = updatePayload;
        const r = await supabase.from('bookings').update(minimal)
          .eq('id', booking_id).is('precheck_completed_at', null)
          .select('id').maybeSingle();
        updated = r.data;
      }

      // Wenn AI-Override genutzt wurde: Admin-Alert per Mail damit Lion das prüfen kann
      if (ai_override) {
        try {
          const { Resend } = require('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            to: 'info@simpletrailer.de',
            reply_to: 'info@simpletrailer.de',
            subject: '⚠️ Pre-Check: KI-Override genutzt',
            text: `Buchung ${booking_id} (${booking.customer_name})\n\nDer Mieter hat die KI-Foto-Prüfung manuell übergangen ("Trotzdem absenden"-Button).\n\nFotos prüfen:\n- Außen: ${photo_url}\n- Ladefläche: ${photo_url_inside}\n\nBitte kurz checken ob die Fotos echte Anhänger-Bilder sind.`
          });
        } catch (mailErr) {
          console.error('Override-Alert-Mail fehlgeschlagen:', mailErr.message);
        }
      }

      return res.status(200).json({ access_code: booking.access_code });
    } catch (err) {
      console.error('precheck POST:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
