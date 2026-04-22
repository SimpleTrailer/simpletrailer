const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { booking_id, precheck_token, photo_url } = req.body;

    if (!booking_id || !precheck_token) {
      return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, status, access_code, precheck_token, precheck_completed_at, customer_name')
      .eq('id', booking_id)
      .eq('precheck_token', precheck_token)
      .single();

    if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
    if (booking.status === 'returned') return res.status(400).json({ error: 'Buchung bereits abgeschlossen' });
    if (booking.precheck_completed_at) {
      // Bereits erledigt – trotzdem Access Code zurückgeben
      return res.status(200).json({ access_code: booking.access_code, already_done: true });
    }

    await supabase.from('bookings').update({
      status: 'active',
      precheck_photo_url: photo_url || null,
      precheck_completed_at: new Date().toISOString()
    }).eq('id', booking_id);

    return res.status(200).json({ access_code: booking.access_code });

  } catch (err) {
    console.error('confirm-precheck:', err);
    return res.status(500).json({ error: err.message });
  }
};
