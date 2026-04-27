/**
 * Endpoint-Vorlage: Account loeschen (Apple-PFLICHT seit iOS 2022, Google empfohlen)
 *
 * Liegt als STUB in mobile-app/server-stub/. Bei Aktivierung:
 * nach api/delete-account.js kopieren.
 *
 * App-Aufruf (von account.html oder einem nativen "Konto loeschen"-Button):
 *
 *   await fetch('/api/delete-account', {
 *     method: 'POST',
 *     headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ confirm: true, reason: 'optional grund' })
 *   });
 */

const { createClient } = require('@supabase/supabase-js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });
  const userToken = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(userToken);
  if (authError || !user) return res.status(401).json({ error: 'Ungueltiger Token' });

  const { confirm } = req.body || {};
  if (!confirm) return res.status(400).json({ error: 'confirm:true erforderlich' });

  try {
    // 1. Pruefe: aktive Buchungen?
    const { data: activeBookings } = await supabase
      .from('bookings')
      .select('id, status, end_time')
      .eq('customer_email', user.email)
      .in('status', ['confirmed', 'active']);

    const futureActive = (activeBookings || []).filter(b => new Date(b.end_time) > new Date());
    if (futureActive.length > 0) {
      return res.status(409).json({
        error: `Du hast noch ${futureActive.length} aktive Buchung${futureActive.length > 1 ? 'en' : ''}. Bitte erst beenden, dann Konto loeschen.`,
        active_bookings: futureActive
      });
    }

    // 2. Push-Tokens loeschen (falls Tabelle existiert)
    await supabase.from('push_tokens').delete().eq('user_id', user.id).then(() => {}, () => {});

    // 3. Buchungs-Historie anonymisieren (NICHT loeschen — Steuerrecht!)
    await supabase
      .from('bookings')
      .update({
        customer_email:   `deleted+${user.id.slice(0, 8)}@simpletrailer.de`,
        customer_name:    'Geloeschter Nutzer',
        customer_phone:   null,
        customer_address: null
      })
      .eq('customer_email', user.email);

    // 4. Auth-User loeschen (kaskadiert dank ON DELETE CASCADE)
    const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
    if (delError) throw delError;

    return res.status(200).json({
      ok: true,
      message: 'Dein Konto wurde geloescht. Buchungs-Historie wurde aus steuerrechtlichen Gruenden anonymisiert aber nicht entfernt.'
    });
  } catch (err) {
    console.error('delete-account:', err);
    return res.status(500).json({ error: err.message });
  }
};
