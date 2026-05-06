/**
 * SimpleTrailer Cron: Wöchentlicher KPI-Report
 *
 * Läuft Montags 7:00 UTC (= 9:00 Berlin) via Vercel Cron.
 * Sendet Email an info@simpletrailer.de mit Wochen-Zusammenfassung:
 *  - Anzahl Buchungen, Brutto/Netto-Umsatz, Trend zur Vorwoche
 *  - Top-Tarif, Top-Anhänger
 *  - Erkannte Probleme (Stripe-Fehler, überfällige Rückgaben)
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { getLionEmail } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
    const lastWeekStart = new Date(Date.now() - 14 * 86400000).toISOString();

    const { data: bookings } = await supabase.from('bookings').select(`
      id, status, total_amount, late_fee_amount, pricing_type, insurance_type,
      created_at, customer_name, customer_email, end_time, actual_return_time,
      trailers(name)
    `).gte('created_at', lastWeekStart);

    const paid = (bookings || []).filter(b => ['confirmed','active','returned'].includes(b.status));
    const sumRev = arr => arr.reduce((s,b) => s + (b.total_amount||0) + (b.late_fee_amount||0), 0);

    const thisWeek = paid.filter(b => b.created_at >= weekStart);
    const lastWeek = paid.filter(b => b.created_at >= lastWeekStart && b.created_at < weekStart);

    const tarifCount = {};
    thisWeek.forEach(b => { tarifCount[b.pricing_type || 'unbekannt'] = (tarifCount[b.pricing_type || 'unbekannt'] || 0) + 1; });
    const topTarif = Object.entries(tarifCount).sort((a,b) => b[1]-a[1])[0];

    const trailerCount = {};
    thisWeek.forEach(b => { const n = b.trailers?.name || 'Unbekannt'; trailerCount[n] = (trailerCount[n]||0)+1; });
    const topTrailer = Object.entries(trailerCount).sort((a,b) => b[1]-a[1])[0];

    const insMix = thisWeek.reduce((acc,b) => {
      const t = b.insurance_type || 'none';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    const trend = (now, prev) => {
      if (prev === 0 && now === 0) return '–';
      if (prev === 0) return `<span style="color:#4ade80;">↑ neu</span>`;
      const pct = Math.round(((now - prev) / prev) * 100);
      const color = pct >= 0 ? '#4ade80' : '#ef4444';
      const arrow = pct >= 0 ? '↑' : '↓';
      return `<span style="color:${color};">${arrow} ${Math.abs(pct)}%</span>`;
    };

    const tarifLabels = { flexible: 'Individuell', day: 'Ganzer Tag', weekend: 'Wochenende', week: '1 Woche' };
    const eur = n => (n||0).toFixed(2).replace('.',',') + ' €';
    const eurNet = n => ((n||0)/1.19).toFixed(2).replace('.',',') + ' €';

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.3rem;margin:16px 0 4px;">Wochen-Report</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">${weekStart.slice(0,10)} – ${now.toISOString().slice(0,10)}</p>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:24px;margin-bottom:18px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;text-align:center;">
            <div>
              <div style="font-size:2rem;font-weight:800;">${thisWeek.length}</div>
              <div style="font-size:.78rem;color:#888;text-transform:uppercase;letter-spacing:.05em;">Buchungen</div>
              <div style="margin-top:6px;font-size:.85rem;">${trend(thisWeek.length, lastWeek.length)} vs. Vorwoche</div>
            </div>
            <div>
              <div style="font-size:2rem;font-weight:800;color:#E85D00;">${eur(sumRev(thisWeek))}</div>
              <div style="font-size:.78rem;color:#888;text-transform:uppercase;letter-spacing:.05em;">Brutto-Umsatz</div>
              <div style="margin-top:6px;font-size:.85rem;color:#888;">${eurNet(sumRev(thisWeek))} netto</div>
            </div>
          </div>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:20px 24px;margin-bottom:18px;">
          <h3 style="font-size:.95rem;margin:0 0 12px;">📊 Diese Woche im Detail</h3>
          <table style="width:100%;font-size:.85rem;">
            <tr><td style="padding:6px 0;color:#888;">Top-Tarif</td><td style="padding:6px 0;text-align:right;">${topTarif ? `${tarifLabels[topTarif[0]] || topTarif[0]} (${topTarif[1]}×)` : '–'}</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Top-Anhänger</td><td style="padding:6px 0;text-align:right;">${topTrailer ? `${topTrailer[0]} (${topTrailer[1]}×)` : '–'}</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Schutzpaket-Mix</td><td style="padding:6px 0;text-align:right;">Premium: ${insMix.premium||0} · Basis: ${insMix.basis||0} · Keins: ${insMix.none||0}</td></tr>
          </table>
        </div>

        <div style="text-align:center;margin-top:24px;">
          <a href="https://simpletrailer.de/admin" style="display:inline-block;background:#E85D00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Cockpit öffnen →</a>
        </div>
        <p style="font-size:.72rem;color:#666;text-align:center;margin:32px 0 0;">Automatischer Report · jeden Montag 7:00 UTC</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Report <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: getLionEmail('briefing'),
      subject: `[ST-Briefing] 📊 Wochen-Report: ${thisWeek.length} Buchungen · ${eur(sumRev(thisWeek))}`,
      html
    });

    return res.status(200).json({
      ok: true,
      thisWeek: thisWeek.length,
      revenue: sumRev(thisWeek),
      lastWeek: lastWeek.length,
    });
  } catch (err) {
    console.error('weekly-report:', err);
    return res.status(500).json({ error: err.message });
  }
};
