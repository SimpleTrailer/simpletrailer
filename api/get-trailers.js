const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { data, error } = await supabase
      .from('trailers')
      .select('id,name,type,description,lat,lng,is_available,image_url,price_kurztrip,price_halftag,price_day,price_extra_day,price_weekend,price_week,last_lat,last_lng,last_seen_at,is_moving')
      .order('type');
    if (error) throw error;

    // Privacy: Live-GPS nur für AKTUELL VERFÜGBARE Anhänger nach außen.
    // Während aktiver Buchung darf Mieter-Position NICHT öffentlich sichtbar sein.
    // Fallback auf statisches lat/lng wenn keine Live-Position vorhanden.
    const nowMs = Date.now();
    const trailers = (data || []).map(t => {
      const liveAge = t.last_seen_at ? (nowMs - new Date(t.last_seen_at).getTime()) / 60000 : null;
      const showLive = t.is_available && t.last_lat != null && t.last_lng != null && liveAge != null && liveAge < 1440;
      return {
        ...t,
        // Public-Position: Live wenn verfügbar UND <24h alt, sonst statischer Stellplatz
        display_lat: showLive ? Number(t.last_lat) : t.lat,
        display_lng: showLive ? Number(t.last_lng) : t.lng,
        position_live: !!showLive,
        position_minutes_ago: liveAge != null ? Math.round(liveAge) : null,
        // Live-Detail-Felder bleiben in der Response (Privacy-Filter unten entfernt sie bei aktiver Buchung)
        last_lat: showLive ? Number(t.last_lat) : null,
        last_lng: showLive ? Number(t.last_lng) : null,
        is_moving: showLive ? !!t.is_moving : false,
      };
    });

    return res.status(200).json({ trailers });
  } catch (err) {
    return res.status(500).json({ trailers: [], error: err.message });
  }
};
