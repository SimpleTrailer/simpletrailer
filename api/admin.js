const { createClient } = require('@supabase/supabase-js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
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

  const section = req.query.section || 'data';

  try {
    if (section === 'users') {
      const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (usersError) throw usersError;
      const { data: bookings } = await supabase.from('bookings').select('customer_email, total_amount, status, created_at');
      const byEmail = {};
      for (const b of bookings || []) {
        if (!b.customer_email) continue;
        if (!byEmail[b.customer_email]) byEmail[b.customer_email] = { count: 0, total: 0 };
        byEmail[b.customer_email].count++;
        if (['confirmed','active','returned'].includes(b.status)) byEmail[b.customer_email].total += b.total_amount || 0;
      }
      const users = usersData.users.map(u => ({
        id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
        first_name: u.user_metadata?.first_name || '', last_name: u.user_metadata?.last_name || '',
        phone: u.user_metadata?.phone || '', confirmed: !!u.email_confirmed_at,
        bookings_count: byEmail[u.email]?.count || 0, bookings_total: byEmail[u.email]?.total || 0,
        dl_status:      u.user_metadata?.dl_status      || 'unverified',
        dl_classes:     u.user_metadata?.dl_classes     || [],
        dl_expires_at:  u.user_metadata?.dl_expires_at  || null,
        dl_verified_at: u.user_metadata?.dl_verified_at || null,
        dl_first_name:  u.user_metadata?.dl_first_name  || '',
        dl_last_name:   u.user_metadata?.dl_last_name   || '',
        dl_dob:         u.user_metadata?.dl_dob         || null,
        dl_doc_number:  u.user_metadata?.dl_doc_number  || null,
        dl_doc_type:    u.user_metadata?.dl_doc_type    || null,
        dl_issuing_country: u.user_metadata?.dl_issuing_country || null,
        dl_session_id:  u.user_metadata?.dl_session_id  || null,
      })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.status(200).json({ users });
    }

    // section === 'data' (default)
    const { data: bookings, error } = await supabase.from('bookings').select(`
      id, customer_name, customer_email, customer_phone,
      start_time, end_time, pricing_type, total_amount,
      status, access_code, actual_return_time,
      late_fee_amount, late_fee_payment_intent_id,
      stripe_payment_intent_id, created_at,
      return_photo_url, precheck_photo_url, insurance_type, insurance_amount,
      trailers(name)
    `).order('created_at', { ascending: false });
    if (error) throw error;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const paid = bookings.filter(b => ['confirmed','active','returned'].includes(b.status));
    const stats = {
      total: bookings.length,
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      active: bookings.filter(b => b.status === 'active').length,
      returned: bookings.filter(b => b.status === 'returned').length,
      revenue: paid.reduce((s,b) => s+(b.total_amount||0)+(b.late_fee_amount||0),0),
      revenue_month: paid.filter(b=>b.created_at>=monthStart).reduce((s,b)=>s+(b.total_amount||0)+(b.late_fee_amount||0),0),
      avg_value: paid.length ? paid.reduce((s,b)=>s+(b.total_amount||0),0)/paid.length : 0,
      insurance_revenue: paid.reduce((s,b)=>s+(b.insurance_amount||0),0),
      insurance_basis_count:   paid.filter(b=>b.insurance_type==='basis').length,
      insurance_premium_count: paid.filter(b=>b.insurance_type==='premium').length,
      insurance_none_count:    paid.filter(b=>!b.insurance_type||b.insurance_type==='none').length,
    };
    return res.status(200).json({ bookings, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
