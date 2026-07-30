const { createClient } = require('@supabase/supabase-js');
const { isLockActive, lockUntilIso } = require('./_booking-lock');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const trailer_id = req.query.trailer_id;
    let query = supabase.from('bookings').select('start_time, end_time').in('status', ['confirmed', 'active']);
    if (trailer_id) query = query.eq('trailer_id', trailer_id);
    const { data, error } = await query;

    if (error) throw error;
    // 1 Stunde Pufferzeit nach jeder Buchung (verhindert Anschlussbuchungen ohne Puffer)
    const BUFFER_MS = 60 * 60 * 1000;
    const booked = (data || []).map(b => ({
      start_time: b.start_time,
      end_time: new Date(new Date(b.end_time).getTime() + BUFFER_MS).toISOString()
    }));
    // Temporäre Buchungssperre: gesamten Zeitraum bis zum Ablauf als belegt
    // markieren, damit der Slot-Kalender alles vor der Freigabe ausgraut.
    if (isLockActive()) {
      booked.push({ start_time: '1970-01-01T00:00:00.000Z', end_time: lockUntilIso() });
    }
    return res.status(200).json({ booked });
  } catch (err) {
    return res.status(500).json({ booked: [] });
  }
};
