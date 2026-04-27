/**
 * Loescht den eingeloggten User. Apple-Pflicht seit 2022 fuer Apps mit Account-Funktion.
 *
 * Logik:
 * 1. Pruefen ob aktive Buchungen vorhanden -> wenn ja, Loeschung verhindern
 * 2. Push-Tokens loeschen
 * 3. Buchungs-Historie ANONYMISIEREN (nicht loeschen — Steuerrecht §147 AO)
 * 4. Auth-User loeschen (Supabase)
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
    // 1. Pruefe aktive Buchungen
    const { data: activeBookings } = await supabase
      .from('bookings')
      .select('id, status, end_time')
      .eq('customer_email', user.email)
      .in('status', ['confirmed', 'active']);

    const futureActive = (activeBookings || []).filter(b => new Date(b.end_time) > new Date());
    if (futureActive.length > 0) {
      return res.status(409).json({
        error: `Du hast noch ${futureActive.length} aktive Buchung${futureActive.length > 1 ? 'en' : ''}. Bitte erst beenden, dann Konto loeschen.`,
        active_bookings: futureActive.map(b => ({ id: b.id, end_time: b.end_time }))
      });
    }

    // 2. Push-Tokens loeschen (silent — wenn Tabelle nicht da, ignorieren)
    try {
      await supabase.from('push_tokens').delete().eq('user_id', user.id);
    } catch (e) { /* push_tokens-Tabelle existiert ggf. nicht */ }

    // 3. Buchungs-Historie anonymisieren (Steuerrecht §147 AO: 10 Jahre Aufbewahrung)
    await supabase
      .from('bookings')
      .update({
        customer_email:   `deleted+${user.id.slice(0, 8)}@simpletrailer.de`,
        customer_name:    'Geloeschter Nutzer',
        customer_phone:   null,
        customer_address: null,
        user_id:          null
      })
      .eq('customer_email', user.email);

    // 4. Auth-User loeschen
    const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
    if (delError) throw delError;

    return res.status(200).json({
      ok: true,
      message: 'Dein Konto wurde geloescht. Buchungs-Historie wurde aus steuerrechtlichen Gruenden anonymisiert (10 Jahre Aufbewahrung), nicht entfernt.'
    });
  } catch (err) {
    console.error('delete-account:', err);
    return res.status(500).json({ error: err.message });
  }
};
