const { createClient } = require('@supabase/supabase-js');
const { setCors } = require('./_cors');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  setCors(req, res);

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
      .select('*, trailers(name, price_kurztrip, price_halftag, price_day, price_extra_day, license_plate, appearance_photo_url)')
      .eq('customer_email', user.email)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Tokens nur für aktive/bestätigte Buchungen mitschicken.
    // Schloss-Code erst NACH dem Vorab-Check rausgeben (fester Code pro Anhänger —
    // vorher darf er die API gar nicht verlassen, das Frontend blendet ihn eh erst dann ein).
    const result = bookings.map(b => ({
      ...b,
      access_code:    (['confirmed', 'active'].includes(b.status) && b.precheck_completed_at) ? b.access_code : null,
      precheck_token: ['confirmed', 'active'].includes(b.status) ? b.precheck_token : null,
      return_token:   ['confirmed', 'active'].includes(b.status) ? b.return_token   : null,
    }));

    return res.status(200).json({ bookings: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
