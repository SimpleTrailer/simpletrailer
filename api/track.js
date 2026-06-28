/**
 * SimpleTrailer: First-Party Event-Tracking fürs Cockpit
 *
 * POST { name, props, session_id, source, path }
 *   -> schreibt eine Zeile in analytics_events.
 *
 * Bewusst "fail-silent": antwortet IMMER 204, egal ob Tabelle fehlt oder
 * Payload Müll ist — der Tracking-Aufruf im Browser darf nie einen Fehler
 * werfen oder die Seite beeinflussen. Solange die Migration
 * (supabase-migration-analytics-events.sql) nicht gelaufen ist, schluckt
 * der Insert-Fehler einfach (Cockpit bleibt leer).
 *
 * DSGVO: keine IP, keine Cookies, kein Name. Nur anonyme Session-ID.
 */
const { createClient } = require('@supabase/supabase-js');
const { isRateLimited } = require('./_rate-limit');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Whitelist: nur diese Event-Namen werden gespeichert (hält die Tabelle sauber).
const ALLOWED = new Set([
  'pageview',
  'booking_funnel_start', 'booking_step_1', 'booking_step_2', 'booking_step_3',
  'booking_step_4', 'booking_step_5',
  'booking_login_success', 'booking_register_success',
  'booking_dl_verify_start', 'booking_dl_verified',
  'booking_pay_clicked', 'booking_payment_error', 'booking_funnel_completed',
  'booking_purchase',
  'notify_signup', 'newsletter_signup',
  'return_page_open', 'precheck_open', 'account_open',
  'simply_callback_request', 'sticky_cta_click'
]);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Großzügiges Limit: Tracking feuert oft pro Session — nur reine Flut abwehren.
  if (isRateLimited(req, { maxPerHour: 1200, maxPerMinute: 240 })) return res.status(204).end();

  // Nur Aufrufe von unserer eigenen Seite akzeptieren (bremst triviales Fremd-Hämmern via curl).
  // Manche Same-Origin-Requests senden keinen Origin-Header → fehlt er, lassen wir durch.
  const orig = String(req.headers.origin || req.headers.referer || '');
  if (orig && !(/^https?:\/\/(www\.)?simpletrailer\.de/.test(orig) || /\.vercel\.app/.test(orig))) {
    return res.status(204).end();
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const name = String(body.name || '').trim().slice(0, 64);
  if (!ALLOWED.has(name)) return res.status(204).end();  // unbekanntes Event → still verwerfen

  const session_id = (String(body.session_id || '').trim().slice(0, 80)) || null;
  const source     = (String(body.source || '').trim().toLowerCase().slice(0, 40)) || null;
  const path       = (String(body.path || '').trim().slice(0, 256)) || null;

  let props = (body.props && typeof body.props === 'object' && !Array.isArray(body.props)) ? body.props : null;
  if (props) { try { if (JSON.stringify(props).length > 2000) props = null; } catch (e) { props = null; } }

  try {
    await supabase.from('analytics_events').insert({ name, session_id, source, path, props });
  } catch (e) { /* fail-silent (z.B. Tabelle noch nicht migriert) */ }

  // Gelegentlich (2%) alte Events (>180 Tage) aufräumen — hält Tabelle + Kosten klein.
  if (Math.random() < 0.02) {
    try {
      await supabase.from('analytics_events')
        .delete()
        .lt('created_at', new Date(Date.now() - 180 * 86400000).toISOString());
    } catch (e) { /* ignore */ }
  }

  return res.status(204).end();
};
