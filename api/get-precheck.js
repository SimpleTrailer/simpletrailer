const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { id, token } = req.query;
  if (!id || !token) return res.status(400).json({ error: 'Fehlende Parameter' });

  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, customer_name, start_time, end_time, pricing_type, total_amount, insurance_type, precheck_completed_at, status, precheck_token')
      .eq('id', id)
      .eq('precheck_token', token)
      .single();

    if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    return res.status(200).json({ booking });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
