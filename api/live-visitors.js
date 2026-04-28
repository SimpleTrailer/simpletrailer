/**
 * Live-Visitor-Stats-Endpoint fuer Admin-Dashboard.
 * Auth-protected (nur admin@simpletrailer.de).
 * Returns: aktuelle Sessions in den letzten 60s, gruppiert nach Pfad.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const ACTIVE_WINDOW_SECONDS = 60; // Session gilt als aktiv wenn Heartbeat in den letzten 60s
const ADMIN_EMAIL = 'admin@simpletrailer.de';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth: nur Admin
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const userToken = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(userToken);
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const cutoff = new Date(Date.now() - ACTIVE_WINDOW_SECONDS * 1000).toISOString();
    const { data, error } = await supabase
      .from('live_sessions')
      .select('session_id, path, last_seen')
      .gte('last_seen', cutoff)
      .order('last_seen', { ascending: false })
      .limit(200);

    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        return res.status(200).json({ count: 0, sessions: [], by_path: {}, skipped: true });
      }
      throw error;
    }

    // Gruppiere nach Pfad
    const byPath = {};
    (data || []).forEach(s => {
      const p = s.path || '/';
      byPath[p] = (byPath[p] || 0) + 1;
    });

    // Cleanup: alte Sessions (>1h) gelegentlich loeschen damit Tabelle nicht waechst
    // Nur bei jeder ~10. Anfrage (10% Wahrscheinlichkeit) um Last zu reduzieren
    if (Math.random() < 0.1) {
      const oldCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      supabase.from('live_sessions').delete().lt('last_seen', oldCutoff).then(() => {}, () => {});
    }

    return res.status(200).json({
      count: data?.length || 0,
      sessions: data || [],
      by_path: byPath,
      window_seconds: ACTIVE_WINDOW_SECONDS
    });
  } catch (err) {
    console.error('live-visitors:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
