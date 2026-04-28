/**
 * Live-Visitor-Heartbeat-Endpoint.
 * Wird von analytics.js alle 30s gerufen (offen + bei pagehide via Beacon).
 * Speichert anonyme Session-ID + aktueller Pfad in live_sessions-Tabelle.
 *
 * Defensiv: wenn live_sessions-Tabelle fehlt -> 503 mit {skipped: true}.
 *           Frontend ignoriert das einfach.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  // Body kann von navigator.sendBeacon als String kommen — beide Formen unterstuetzen
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const sessionId = String(body.session_id || '').slice(0, 64);
  const path      = String(body.path || '/').slice(0, 200);

  if (!sessionId) return res.status(400).json({ error: 'session_id required' });

  try {
    const { error } = await supabase
      .from('live_sessions')
      .upsert({
        session_id: sessionId,
        path,
        last_seen: new Date().toISOString()
      }, { onConflict: 'session_id' });

    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        return res.status(503).json({ error: 'live_sessions table missing', skipped: true });
      }
      throw error;
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('heartbeat:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
