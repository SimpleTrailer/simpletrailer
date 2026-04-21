const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  // Auth-Token prüfen
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Nicht autorisiert' }) };
  }

  const token = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Ungültiger Token' }) };
  }

  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_email, customer_phone,
        start_time, end_time, pricing_type, total_amount,
        status, access_code, actual_return_time,
        late_fee_amount, late_fee_payment_intent_id,
        stripe_payment_intent_id, created_at,
        trailers(name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Statistiken
    const stats = {
      total: bookings.length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      active: bookings.filter(b => b.status === 'active').length,
      returned: bookings.filter(b => b.status === 'returned').length,
      revenue: bookings
        .filter(b => ['confirmed', 'returned'].includes(b.status))
        .reduce((sum, b) => sum + b.total_amount + (b.late_fee_amount || 0), 0)
    };

    return { statusCode: 200, headers, body: JSON.stringify({ bookings, stats }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
