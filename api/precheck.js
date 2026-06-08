const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { id, token } = req.query;
    if (!id || !token) return res.status(400).json({ error: 'Fehlende Parameter' });

    try {
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('id, customer_name, start_time, end_time, pricing_type, total_amount, insurance_type, precheck_completed_at, status, precheck_token, trailers(name)')
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
      const { booking_id, precheck_token, photo_url, photo_url_inside } = req.body;
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

      // Update mit beiden Fotos — bei fehlender Spalte (Migration ausstehend) fallback auf nur outside-Foto
      const updatePayload = {
        status: 'active',
        precheck_photo_url: photo_url || null,
        precheck_photo_url_inside: photo_url_inside || null,
        precheck_completed_at: new Date().toISOString()
      };
      let { error: updErr } = await supabase.from('bookings').update(updatePayload).eq('id', booking_id);
      if (updErr && /column .* does not exist/i.test(updErr.message || '')) {
        const { precheck_photo_url_inside, ...minimal } = updatePayload;
        await supabase.from('bookings').update(minimal).eq('id', booking_id);
      }

      return res.status(200).json({ access_code: booking.access_code });
    } catch (err) {
      console.error('precheck POST:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
