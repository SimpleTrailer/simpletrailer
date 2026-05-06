/**
 * SimpleTrailer Cron: Mid-Week-Check (consultant kurz)
 *
 * Laeuft Mittwochs 12:00 UTC.
 * Kurze Version vom weekly-advisor:
 *  - Daten der letzten 3 Tage
 *  - Mini-Analyse + 1-2 sofortige Maßnahmen
 *  - Mail an Lion
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { getLionEmail } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
  }

  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: bookings } = await supabase.from('bookings').select(`
      id, status, total_amount, pricing_type, insurance_type, created_at,
      trailers(name)
    `).gte('created_at', threeDaysAgo);

    const paid = (bookings || []).filter(b => ['confirmed','active','returned'].includes(b.status));
    const summary = {
      period: 'letzte 3 Tage',
      bookings: paid.length,
      revenueGross: paid.reduce((s,b) => s + (b.total_amount||0), 0),
      pending: (bookings || []).filter(b => b.status === 'pending').length,
    };

    const systemPrompt = `Du bist consultant fuer SimpleTrailer (Anhaengervermietung Bremen, frisch live). Stil: direkt, daten-getrieben, pragmatisch.

Liefere einen MID-WEEK-CHECK als HTML (max 250 Woerter) mit 1-2 sofortigen Maßnahmen für die naechsten 3-4 Tage.

Format:
<h3>🎯 Quick-Take</h3><p>1-2 Saetze.</p>
<h3>⚡ Sofortige Maßnahmen</h3><ol><li>Konkrete Maßnahme + Aufwand + erwarteter Effekt</li></ol>
<h3>📊 Zahlen</h3><p>3-Tage-Zusammenfassung.</p>

Kein Marketing-BS.`;

    const userMessage = `Daten letzte 3 Tage:\n${JSON.stringify(summary, null, 2)}\n\nWas sollte ich bis Sonntag noch machen, das schnell wirkt?`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) throw new Error(`Anthropic ${anthropicRes.status}`);

    const data = await anthropicRes.json();
    const recommendation = data.content?.[0]?.text || '';
    if (!recommendation) throw new Error('Empty recommendation');

    // In ai_insights speichern
    try {
      await supabase.from('ai_insights').insert({
        type: 'weekly-advisor',
        recommendation,
        data_snapshot: { ...summary, source: 'midweek-check' },
      });
    } catch (e) { /* table missing */ }

    // Mail
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.2rem;margin:14px 0 4px;">⚡ Mid-Week-Check</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">consultant · Mittwoch ${new Date().toLocaleDateString('de-DE')}</p>
        </div>
        <div style="background:linear-gradient(135deg,#1a0f29,#0d0d0d);border:1px solid #3a1a5f;border-radius:14px;padding:24px;color:#ddd;line-height:1.6;font-size:.9rem;">
          ${recommendation}
        </div>
        <div style="text-align:center;margin-top:20px;">
          <a href="https://simpletrailer.de/admin" style="display:inline-block;background:#E85D00;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:.9rem;">Cockpit oeffnen →</a>
        </div>
        <p style="font-size:.7rem;color:#555;text-align:center;margin:24px 0 0;">midweek-check · Mittwochs 12:00 UTC</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Strategie <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: getLionEmail('briefing'),
      subject: `[ST-Briefing] ⚡ Mid-Week-Check — ${paid.length} Buchungen letzte 3 Tage`,
      html
    });

    return res.status(200).json({ ok: true, recommendation_length: recommendation.length });
  } catch (err) {
    console.error('midweek-check:', err);
    return res.status(500).json({ error: err.message });
  }
};
