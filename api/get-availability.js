const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('start_time, end_time')
      .in('status', ['confirmed', 'active']);

    if (error) throw error;
    return res.status(200).json({ booked: data || [] });
  } catch (err) {
    return res.status(500).json({ booked: [] });
  }
};
