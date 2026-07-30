/**
 * Schäden-API für SimpleTrailer
 *
 * GET    ?trailer_id=...&status=open   → Schadens-Liste pro Trailer (für Mieter-Pre-Check + Admin-Flotte)
 * POST   { trailer_id, booking_id, severity, description, photo_url, source } → neuen Schaden anlegen
 * PATCH  { id, status: 'resolved'|'wont_fix', resolved_note } → Admin markiert Schaden als erledigt
 *
 * GET ist öffentlich (Mieter im Pre-Check braucht Liste OHNE Login).
 * POST + PATCH brauchen Admin-Auth (über Admin-Whitelist + Service-Role).
 * Ausnahme: POST mit source='pre_check'/'customer_report' braucht booking_id + return_token zum
 * Verifizieren dass der Mieter wirklich der Buchungsinhaber ist.
 */
const { createClient } = require('@supabase/supabase-js');
const { setCors } = require('./_cors');
const { pushLion } = require('./_lion-push.js');
const { isRateLimited } = require('./_rate-limit.js');

// User-Input darf nie roh ins Mail-HTML
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'admin@simpletrailer.de,info@simpletrailer.de,lion@simpletrailer.de')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function isAdmin(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const { data: { user } } = await supabaseAuth.auth.getUser(auth.replace('Bearer ', ''));
  if (!user) return false;
  return ADMIN_EMAILS.includes((user.email || '').toLowerCase());
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ─── GET: Schadens-Liste ─────────────────────────────────────
    if (req.method === 'GET') {
      const { trailer_id, status } = req.query;
      if (!trailer_id) return res.status(400).json({ error: 'trailer_id erforderlich' });

      // Öffentlicher GET (Pre-Check ohne Login): NUR Anzeige-Felder, KEIN booking_id/reported_by
      // (sonst Korrelation Schaden↔Buchung von außen möglich).
      let q = supabase.from('damages')
        .select('id, trailer_id, severity, description, photo_url, status, created_at')
        .eq('trailer_id', trailer_id)
        .order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);

      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ damages: data || [] });
    }

    // ─── POST: neuen Schaden anlegen ─────────────────────────────
    if (req.method === 'POST') {
      // Jede Meldung erzeugt eine Alarm-Mail an Lion — ohne Limit wäre das ein Spam-Kanal.
      if (isRateLimited(req, { maxPerHour: 6, maxPerMinute: 3 })) {
        return res.status(429).json({ error: 'Zu viele Meldungen — bitte warte kurz oder schreib uns an info@simpletrailer.de.' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { trailer_id, booking_id, severity, description, photo_url, source, precheck_token, return_token } = body;

      if (!trailer_id || !severity || !description) {
        return res.status(400).json({ error: 'trailer_id + severity + description erforderlich' });
      }

      // photo_url nur akzeptieren, wenn sie auf UNSEREN Storage zeigt — sonst landet ein
      // beliebiges Link-Ziel in der DB und als Klick-Link in der Alarm-Mail (Phishing).
      const STORAGE_PREFIX = `${process.env.SUPABASE_URL}/storage/v1/object/public/`;
      const safePhotoUrl = (photo_url && String(photo_url).startsWith(STORAGE_PREFIX)) ? String(photo_url) : null;
      const safeDescription = String(description).slice(0, 1000);
      if (!['minor', 'major', 'not_drivable'].includes(severity)) {
        return res.status(400).json({ error: 'severity muss minor/major/not_drivable sein' });
      }
      if (!['pre_check', 'return', 'admin', 'customer_report'].includes(source)) {
        return res.status(400).json({ error: 'source muss pre_check/return/admin/customer_report sein' });
      }

      // Auth-Check je nach Quelle
      let reportedBy = 'unknown';
      if (source === 'admin') {
        if (!(await isAdmin(req))) return res.status(403).json({ error: 'Nur Admin' });
        reportedBy = 'admin';
      } else if (source === 'pre_check' || source === 'return') {
        // Verifizieren: Mieter darf nur Schäden für SEINE eigene Buchung melden
        if (!booking_id) return res.status(400).json({ error: 'booking_id erforderlich' });
        const tokenField = source === 'pre_check' ? 'precheck_token' : 'return_token';
        const tokenValue = source === 'pre_check' ? precheck_token  : return_token;
        if (!tokenValue) return res.status(400).json({ error: `${tokenField} erforderlich` });
        const { data: booking } = await supabase
          .from('bookings').select('id, customer_email')
          .eq('id', booking_id).eq(tokenField, tokenValue).maybeSingle();
        if (!booking) return res.status(403).json({ error: 'Buchung/Token stimmt nicht' });
        reportedBy = booking.customer_email;
      } else {
        // customer_report braucht Login
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Login erforderlich' });
        const { data: { user } } = await supabaseAuth.auth.getUser(auth.replace('Bearer ', ''));
        if (!user) return res.status(401).json({ error: 'Ungültiger Token' });
        reportedBy = user.email || 'unknown';
      }

      const { data, error } = await supabase.from('damages').insert({
        trailer_id, booking_id: booking_id || null,
        source, severity, description: safeDescription, photo_url: safePhotoUrl,
        reported_by: reportedBy
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });

      // Lion SOFORT informieren (außer bei Admin-Einträgen — die macht er selbst).
      // Fail-open: Ein Alert-Fehler darf die Schadensmeldung nie kaputt machen.
      if (source !== 'admin') {
        try {
          const { data: trailer } = await supabase.from('trailers').select('name').eq('id', trailer_id).maybeSingle();
          const sevLabels = { minor: 'Klein', major: 'Größer', not_drivable: '🚫 NICHT FAHRBEREIT' };
          const srcLabels = { pre_check: 'Vorab-Check (Abholung)', return: 'Rückgabe', customer_report: 'Kundenkonto' };
          await pushLion({
            severity: severity === 'not_drivable' ? 'red' : 'yellow',
            category: 'alert',
            title: `Schadensmeldung (${sevLabels[severity] || severity}): ${trailer?.name || 'Anhänger'}`,
            htmlBody: `
              <table style="width:100%;font-size:.92rem;line-height:1.6;">
                <tr><td style="color:#888;width:35%;">Anhänger</td><td><strong>${esc(trailer?.name || trailer_id)}</strong></td></tr>
                <tr><td style="color:#888;">Schwere</td><td>${sevLabels[severity] || esc(severity)}</td></tr>
                <tr><td style="color:#888;">Gemeldet bei</td><td>${srcLabels[source] || esc(source)}</td></tr>
                <tr><td style="color:#888;">Von</td><td>${esc(reportedBy)}</td></tr>
                ${booking_id ? `<tr><td style="color:#888;">Buchung</td><td><code>#${esc(String(booking_id).slice(0,8).toUpperCase())}</code></td></tr>` : ''}
              </table>
              <p style="background:#0a0a0a;padding:12px;border-radius:8px;font-size:.9rem;white-space:pre-wrap;">${esc(safeDescription).slice(0, 600)}</p>
              ${safePhotoUrl ? `<p><a href="${esc(safePhotoUrl)}" style="color:#E85D00;">📷 Schadensfoto ansehen</a></p>` : ''}
            `,
            link: 'https://simpletrailer.de/admin',
          });
        } catch (alertErr) {
          console.warn('damages: Lion-Alert fehlgeschlagen:', alertErr.message);
        }
      }

      return res.status(200).json({ damage: data });
    }

    // ─── PATCH: Status updaten (resolved / wont_fix) ─────────────
    if (req.method === 'PATCH') {
      if (!(await isAdmin(req))) return res.status(403).json({ error: 'Nur Admin' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { id, status, resolved_note } = body;
      if (!id || !status) return res.status(400).json({ error: 'id + status erforderlich' });
      if (!['open', 'resolved', 'wont_fix'].includes(status)) {
        return res.status(400).json({ error: 'status muss open/resolved/wont_fix sein' });
      }

      const updates = { status };
      if (status === 'resolved' || status === 'wont_fix') {
        updates.resolved_at = new Date().toISOString();
        if (resolved_note) updates.resolved_note = resolved_note;
      } else {
        updates.resolved_at = null;
        updates.resolved_note = null;
      }

      const { data, error } = await supabase.from('damages').update(updates).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ damage: data });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('damages:', err);
    return res.status(500).json({ error: err.message });
  }
};
