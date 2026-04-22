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

  try {
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw usersError;

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('customer_email, total_amount, status, created_at');
    if (bookingsError) throw bookingsError;

    const bookingsByEmail = {};
    for (const b of bookings) {
      const email = b.customer_email;
      if (!email) continue;
      if (!bookingsByEmail[email]) bookingsByEmail[email] = { count: 0, total: 0 };
      bookingsByEmail[email].count++;
      if (['confirmed', 'active', 'returned'].includes(b.status)) {
        bookingsByEmail[email].total += b.total_amount || 0;
      }
    }

    const users = usersData.users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      first_name: u.user_metadata?.first_name || '',
      last_name: u.user_metadata?.last_name || '',
      phone: u.user_metadata?.phone || '',
      confirmed: !!u.email_confirmed_at,
      bookings_count: bookingsByEmail[u.email]?.count || 0,
      bookings_total: bookingsByEmail[u.email]?.total || 0,
    }));

    users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
