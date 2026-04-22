const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });

  const token = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Ungültiger Token' });

  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_email, customer_phone,
        start_time, end_time, pricing_type, total_amount,
        status, access_code, actual_return_time,
        late_fee_amount, late_fee_payment_intent_id,
        stripe_payment_intent_id, created_at,
        return_photo_url, precheck_photo_url, insurance_type, insurance_amount,
        trailers(name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const paidBookings = bookings.filter(b => ['confirmed', 'active', 'returned'].includes(b.status));

    const stats = {
      total: bookings.length,
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      active: bookings.filter(b => b.status === 'active').length,
      returned: bookings.filter(b => b.status === 'returned').length,
      revenue: paidBookings.reduce((sum, b) => sum + (b.total_amount || 0) + (b.late_fee_amount || 0), 0),
      revenue_month: paidBookings
        .filter(b => b.created_at >= monthStart)
        .reduce((sum, b) => sum + (b.total_amount || 0) + (b.late_fee_amount || 0), 0),
      avg_value: paidBookings.length
        ? paidBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0) / paidBookings.length
        : 0,
      insurance_revenue: paidBookings.reduce((sum, b) => sum + (b.insurance_amount || 0), 0),
      insurance_basis_count:   paidBookings.filter(b => b.insurance_type === 'basis').length,
      insurance_premium_count: paidBookings.filter(b => b.insurance_type === 'premium').length,
      insurance_none_count:    paidBookings.filter(b => !b.insurance_type || b.insurance_type === 'none').length,
    };

    return res.status(200).json({ bookings, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
