/**
 * Endpoint-Vorlage: Push-Token speichern
 * Liegt als STUB in mobile-app/server-stub/ — bei Aktivierung
 * nach api/save-push-token.js kopieren.
 *
 * Aufruf von der App (in der WebView, sobald die Webseite native erkannt hat):
 *
 *   const token = localStorage.getItem('st_push_token');
 *   if (token) {
 *     await fetch('/api/save-push-token', {
 *       method: 'POST',
 *       headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ token, platform: 'ios' })
 *     });
 *   }
 */

const { createClient } = require('@supabase/supabase-js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  // Auth
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });
  const userToken = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(userToken);
  if (authError || !user) return res.status(401).json({ error: 'Ungueltiger Token' });

  const { token, platform } = req.body || {};
  if (!token || !['ios', 'android'].includes(platform)) {
    return res.status(400).json({ error: 'token und platform (ios|android) erforderlich' });
  }

  try {
    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,token' });

    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
