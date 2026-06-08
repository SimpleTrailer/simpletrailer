/**
 * Trailer-Position fuer return.html — Live-Refresh-Endpoint
 *
 * GET /api/trailer-position?id=BOOKING_ID&token=RETURN_TOKEN
 * Liefert: { last_lat, last_lng, last_seen_at, age_minutes }
 *
 * Token-Schutz: nur wer den return_token kennt, kann die Position abfragen.
 * Verhindert dass beliebige Besucher Trailer-Positionen ausspionieren.
 *
 * Optional: triggert auch on-demand Traccar-Refresh (gleicher Mechanismus wie
 * in process-return.js), damit die Karte beim Mieter sofort frisch ist.
 */
const { createClient } = require('@supabase/supabase-js');
const { setCors } = require('./_cors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { id, token } = req.query;
  if (!id || !token) return res.status(400).json({ error: 'Fehlende Parameter' });

  try {
    // Token-Verifikation: nur fuer Inhaber des return_token sichtbar
    const { data: booking, error: bErr } = await supabase
      .from('bookings').select('id, trailer_id')
      .eq('id', id).eq('return_token', token).maybeSingle();
    if (bErr || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    const { data: trailer } = await supabase
      .from('trailers')
      .select('last_lat, last_lng, last_seen_at, tracker_traccar_id')
      .eq('id', booking.trailer_id)
      .maybeSingle();

    // Optional: on-demand Traccar-Refresh, damit Karte beim Mieter aktuell ist
    let lat = trailer?.last_lat;
    let lng = trailer?.last_lng;
    let seenAt = trailer?.last_seen_at;
    if (trailer?.tracker_traccar_id && process.env.TRACCAR_URL && process.env.TRACCAR_USERNAME) {
      try {
        const auth = Buffer.from(`${process.env.TRACCAR_USERNAME}:${process.env.TRACCAR_PASSWORD}`).toString('base64');
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 3500);
        const r = await fetch(`${process.env.TRACCAR_URL}/api/positions?deviceId=${trailer.tracker_traccar_id}`, {
          headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
          signal: ctrl.signal
        });
        clearTimeout(timeoutId);
        if (r.ok) {
          const positions = await r.json();
          const pos = positions[0];
          if (pos && pos.valid === true) {
            const freshLat = parseFloat(pos.latitude);
            const freshLng = parseFloat(pos.longitude);
            if (Math.abs(freshLat) > 0.0001 && Math.abs(freshLng) > 0.0001) {
              lat = freshLat; lng = freshLng;
              seenAt = pos.fixTime || pos.deviceTime || seenAt;
              await supabase.from('trailers').update({
                last_lat: freshLat, last_lng: freshLng,
                last_seen_at: seenAt
              }).eq('id', booking.trailer_id);
            }
          }
        }
      } catch (e) { /* fail-soft */ }
    }

    const ageMinutes = seenAt ? Math.round((Date.now() - new Date(seenAt).getTime()) / 60000) : null;

    return res.status(200).json({
      last_lat: lat || null,
      last_lng: lng || null,
      last_seen_at: seenAt || null,
      age_minutes: ageMinutes
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
