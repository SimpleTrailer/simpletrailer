const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { id, token } = req.query;
  if (!id || !token) return res.status(400).json({ error: 'Fehlende Parameter' });

  try {
    const { data: booking, error } = await supabase
      .from('bookings').select('*, trailers(name, late_fee_per_hour)')
      .eq('id', id).eq('return_token', token).single();

    if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    const { stripe_payment_method_id, stripe_customer_id, return_token, ...safe } = booking;
    return res.status(200).json(safe);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
