const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { data, error } = await supabase
      .from('trailers')
      .select('id,name,type,description,lat,lng,is_available,image_url,price_kurztrip,price_halftag,price_day,price_extra_day,price_weekend,price_week')
      .order('type');
    if (error) throw error;
    return res.status(200).json({ trailers: data || [] });
  } catch (err) {
    return res.status(500).json({ trailers: [], error: err.message });
  }
};
