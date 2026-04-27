/**
 * Speichert/aktualisiert einen Push-Notification-Token (FCM/APNs) fuer einen User.
 * Wird von der Mobile-App (oder PWA) aufgerufen sobald der User Push-Berechtigung erteilt.
 *
 * Voraussetzung: Tabelle 'push_tokens' in Supabase. SQL siehe unten / SETUP-NEEDED.md.
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

  const { token, platform } = req.body || {};
  if (!token || !['ios', 'android', 'web'].includes(platform)) {
    return res.status(400).json({ error: 'token und platform (ios|android|web) erforderlich' });
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

    if (error) {
      // Defensiv: wenn Tabelle nicht existiert, gracefully fail (kein Crash)
      if (/relation .* does not exist|column .* does not exist/i.test(error.message || '')) {
        console.warn('push_tokens-Tabelle fehlt — bitte SQL aus mobile-app/server-stub/push-notification-sender.js ausfuehren.');
        return res.status(503).json({ error: 'Push-System wird vorbereitet', skipped: true });
      }
      throw error;
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('save-push-token:', err);
    return res.status(500).json({ error: err.message });
  }
};
