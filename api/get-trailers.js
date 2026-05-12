const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Alle Anhänger holen
    const { data: trailerData, error } = await supabase
      .from('trailers')
      .select('id,name,type,description,lat,lng,is_available,image_url,price_kurztrip,price_halftag,price_day,price_extra_day,price_weekend,price_week,tracker_imei,last_lat,last_lng,last_seen_at,is_moving')
      .order('type');
    if (error) throw error;

    const trailerIds = (trailerData || []).map(t => t.id);
    const now = new Date();
    const nowIso = now.toISOString();

    // Aktive + zukünftige Buchungen (status confirmed/active, end_time > now)
    // Damit wir bestimmen können: gerade gebucht? wann frei?
    const { data: bookings } = await supabase
      .from('bookings')
      .select('trailer_id, start_time, end_time, status')
      .in('trailer_id', trailerIds.length ? trailerIds : ['00000000-0000-0000-0000-000000000000'])
      .in('status', ['confirmed', 'active'])
      .gte('end_time', nowIso)
      .order('start_time');

    // Pro Trailer: laufende Buchung jetzt + nächste freie Zeit berechnen
    const bookingsByTrailer = {};
    (bookings || []).forEach(b => {
      if (!bookingsByTrailer[b.trailer_id]) bookingsByTrailer[b.trailer_id] = [];
      bookingsByTrailer[b.trailer_id].push(b);
    });

    const trailers = (trailerData || []).map(t => {
      const tBookings = bookingsByTrailer[t.id] || [];
      const currentBooking = tBookings.find(b => {
        const s = new Date(b.start_time).getTime();
        const e = new Date(b.end_time).getTime();
        return s <= now.getTime() && e >= now.getTime();
      });
      const futureBookings = tBookings.filter(b => new Date(b.start_time).getTime() > now.getTime());
      const nextBooking = futureBookings[0] || null;

      const currentlyBooked = !!currentBooking;
      // Effektive Verfügbarkeit: DB-Flag + KEINE aktuelle Buchung
      const effectiveAvailable = !!t.is_available && !currentlyBooked;
      const availableFromIso = currentBooking ? currentBooking.end_time : null;

      // Live-GPS-Position publik zeigen nur wenn:
      //  - is_available = true (Anhänger soll überhaupt sichtbar sein)
      //  - keine laufende Buchung (Privacy: Mieter-Bewegung nicht public)
      //  - Position-Fix da + <24h alt
      const liveAge = t.last_seen_at ? (now.getTime() - new Date(t.last_seen_at).getTime()) / 60000 : null;
      const showLive = effectiveAvailable
                    && t.last_lat != null && t.last_lng != null
                    && liveAge != null && liveAge < 1440;

      return {
        id: t.id,
        name: t.name,
        type: t.type,
        description: t.description,
        image_url: t.image_url,
        // Preise
        price_kurztrip: t.price_kurztrip,
        price_halftag: t.price_halftag,
        price_day: t.price_day,
        price_extra_day: t.price_extra_day,
        price_weekend: t.price_weekend,
        price_week: t.price_week,
        // Statischer Stellplatz (immer da)
        lat: t.lat,
        lng: t.lng,
        // Effektive Anzeige-Position (Live oder statisch)
        display_lat: showLive ? Number(t.last_lat) : t.lat,
        display_lng: showLive ? Number(t.last_lng) : t.lng,
        position_live: !!showLive,
        position_minutes_ago: liveAge != null ? Math.round(liveAge) : null,
        // Detail-Felder nur wenn showLive
        last_lat: showLive ? Number(t.last_lat) : null,
        last_lng: showLive ? Number(t.last_lng) : null,
        is_moving: showLive ? !!t.is_moving : false,
        last_seen_at: showLive ? t.last_seen_at : null,
        // Buchungs-Status
        is_available: effectiveAvailable,
        currently_booked: currentlyBooked,
        available_from: availableFromIso,
        next_booking_start: nextBooking ? nextBooking.start_time : null,
      };
    });

    return res.status(200).json({ trailers });
  } catch (err) {
    return res.status(500).json({ trailers: [], error: err.message });
  }
};
