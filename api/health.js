/* Healthcheck-Endpoint für Uptime-Monitoring (z.B. UptimeRobot, Better Uptime, Cronitor)
 * Prüft Supabase- und Mollie-Konnektivität.
 * Antwort 200 = alles OK, 503 = mindestens ein Service down.
 */
const { createClient } = require('@supabase/supabase-js');
const { mollie } = require('./_mollie');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const checks = {};
  const start = Date.now();

  // Supabase
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const t0 = Date.now();
    const { error } = await supabase.from('trailers').select('id').limit(1);
    checks.supabase = {
      ok: !error,
      latency_ms: Date.now() - t0,
      error: error?.message
    };
  } catch (e) {
    checks.supabase = { ok: false, error: e.message };
  }

  // Mollie — /methods ist der billigste Aufruf, der Key + Konto-Status verifiziert.
  // ACHTUNG: /methods kennt KEINEN 'limit'-Parameter (HTTP 422). Ohne Parameter aufrufen —
  // sonst meldet der Healthcheck dauerhaft 503 und das Monitoring schlägt grundlos Alarm.
  try {
    const t0 = Date.now();
    await mollie('/methods');
    checks.mollie = { ok: true, latency_ms: Date.now() - t0 };
  } catch (e) {
    checks.mollie = { ok: false, error: e.message };
  }

  // Resend (nur Konfig prüfen, kein API-Call um Quota nicht zu verbrauchen)
  checks.resend = { ok: !!process.env.RESEND_API_KEY };

  const allOk = Object.values(checks).every(c => c.ok);
  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    total_latency_ms: Date.now() - start,
    checks
  });
};
