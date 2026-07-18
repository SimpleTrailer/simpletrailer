const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Vercel-Edge-Cache: 30s frisch, danach bis 5 Min stale-while-revalidate.
  // Wiederholte Seiten-Loads treffen den Edge-Cache statt Function+DB
  // (Browser cached nicht: max-age=0). Client pollt ohnehin alle 60s.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Anhänger + relevante Buchungen PARALLEL holen (Buchungs-Query braucht
    // die Trailer-IDs nicht — Filter über Status + end_time reicht)
    const [trailersRes, bookingsRes] = await Promise.all([
      supabase
        .from('trailers')
        .select('id,name,type,description,lat,lng,is_available,image_url,price_kurztrip,price_halftag,price_day,price_extra_day,price_weekend,price_week,tracker_imei,last_lat,last_lng,last_seen_at,is_moving')
        .order('type'),
      // Aktive + zukünftige Buchungen (status confirmed/active, end_time > now)
      // Damit wir bestimmen können: gerade gebucht? wann frei?
      supabase
        .from('bookings')
        .select('trailer_id, start_time, end_time, status, free_floating')
        .in('status', ['confirmed', 'active'])
        .gte('end_time', nowIso)
        .order('start_time'),
    ]);
    if (trailersRes.error) throw trailersRes.error;
    // Bookings-Fehler NICHT verschlucken: sonst würde "alles frei" als 200
    // in Edge- und Client-Cache landen
    if (bookingsRes.error) throw bookingsRes.error;
    const trailerData = trailersRes.data;
    const bookings = bookingsRes.data;

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

      // "Frei ab" = erster WIRKLICH buchbarer Zeitpunkt: Ende der laufenden Buchung
      // + 1h Rückgabe-Puffer — und wenn bis zur nächsten Buchung keine Kurztrip-Lücke
      // (3h) bleibt, hinter die Folge-Buchung(en) springen. Sonst steht "frei ab 16 Uhr",
      // obwohl wegen einer Abend-Buchung real erst ab 22 Uhr buchbar ist.
      const BUFFER_MS  = 60 * 60 * 1000;
      const MIN_GAP_MS = 3 * 60 * 60 * 1000;
      let availableFromIso = null;
      if (currentBooking) {
        let candidate = new Date(currentBooking.end_time).getTime() + BUFFER_MS;
        for (const b of tBookings) {              // nach start_time sortiert
          const s = new Date(b.start_time).getTime();
          const e = new Date(b.end_time).getTime() + BUFFER_MS;
          if (e <= candidate) continue;           // liegt komplett vor dem Kandidaten
          if (s >= candidate + MIN_GAP_MS) break; // echte Lücke vor dieser Buchung → Kandidat gilt
          candidate = e;                          // blockiert den Kandidaten → dahinter springen
        }
        // Auf volle Stunde aufrunden — das Slot-Raster der Buchungsseite ist stündlich
        const cd = new Date(candidate);
        if (cd.getUTCMinutes() || cd.getUTCSeconds()) cd.setUTCHours(cd.getUTCHours() + 1, 0, 0, 0);
        availableFromIso = cd.toISOString();
      }

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
        // Laufende Miete mit Free-Floating-Rückgabe → der nächste Abhol-Ort steht
        // erst nach der Rückgabe fest (lat/lng ist nur der eingefrorene alte Standort).
        // Bei fester Rückgabe (free_floating false/unbekannt) bringt der Mieter den
        // Anhänger an den Abhol-Ort zurück → Position darf angezeigt werden.
        free_floating_return: currentlyBooked && currentBooking.free_floating === true,
        available_from: availableFromIso,
        next_booking_start: nextBooking ? nextBooking.start_time : null,
      };
    });

    return res.status(200).json({ trailers });
  } catch (err) {
    return res.status(500).json({ trailers: [], error: err.message });
  }
};
