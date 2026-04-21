const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const { id, token } = event.queryStringParameters || {};
  if (!id || !token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Fehlende Parameter' }) };

  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, trailers(name, late_fee_per_hour)')
      .eq('id', id)
      .eq('return_token', token)
      .single();

    if (error || !booking) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Buchung nicht gefunden' }) };
    }

    // Sensible Felder nicht zurückgeben
    const { stripe_payment_method_id, stripe_customer_id, return_token, ...safe } = booking;

    return { statusCode: 200, headers, body: JSON.stringify(safe) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
