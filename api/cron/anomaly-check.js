/**
 * SimpleTrailer Cron: Anomalie-Check
 *
 * Läuft alle 6 Stunden via Vercel Cron.
 * Prüft auf:
 *  - Buchungen mit Stripe-Fehler (status=pending seit >1h)
 *  - Überfällige Anhänger (active + end_time + 1h < now, kein actual_return_time)
 *  - Buchungs-Drop-Off (diese Woche < 50% der letzten Woche)
 *
 * Bei Anomalie: Email an info@simpletrailer.de.
 * Bei keiner: einfach OK zurück.
 */
const { createClient } = require('@supabase/supabase-js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// User-Input (Name/Email aus dem Buchungsformular) darf nie roh ins Mail-HTML
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

module.exports = async (req, res) => {
  // Auth via Vercel-Cron-Header oder manuelles Token
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token'];
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const anomalies = [];
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();

    // 1) Pending-Buchungen seit >1h
    const { data: stalePending } = await supabase
      .from('bookings')
      .select('id, customer_email, customer_name, total_amount, created_at')
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo);

    if ((stalePending || []).length > 0) {
      anomalies.push({
        severity: 'red',
        title: `${stalePending.length} Buchung(en) seit >1h "pending"`,
        detail: 'Vermutlich Stripe-Zahlungsfehler.',
        list: stalePending.slice(0, 5).map(b =>
          `- ${esc(b.customer_name)} (${esc(b.customer_email)}) · ${(b.total_amount||0).toFixed(2)}€ · ID: ${b.id.slice(0,8)}`
        ).join('\n')
      });
    }

    // 2) Überfällige Anhänger
    const { data: actives } = await supabase
      .from('bookings')
      .select('id, customer_email, customer_name, end_time, actual_return_time')
      .eq('status', 'active');

    const overdue = (actives || []).filter(b => {
      const end = new Date(b.end_time).getTime();
      return Date.now() > end + 3600000 && !b.actual_return_time;
    });

    if (overdue.length > 0) {
      anomalies.push({
        severity: 'red',
        title: `${overdue.length} Anhänger überfällig`,
        detail: 'Mietende > 1 Stunde her, keine Rückgabe registriert.',
        list: overdue.slice(0, 5).map(b =>
          `- ${esc(b.customer_name)} · Ende ${new Date(b.end_time).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · ID: ${b.id.slice(0,8)}`
        ).join('\n')
      });
    }

    // 2b) SICHERHEITSNETZ: Bezahlt, aber nie abgeholt (Status blieb 'confirmed') und Mietzeit >3h vorbei.
    //     Eigentlich schließt send-reminders solche Buchungen nach 1h automatisch ab (No-Show) —
    //     wenn dieser Check anschlägt, ist der Auto-Abschluss kaputt (z.B. Migration no_show fehlt).
    //     Max. 7 Tage zurück, damit uralte Fälle nicht ewig alarmieren.
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    const { data: neverPickedUp, error: npError } = await supabase
      .from('bookings')
      .select('id, customer_email, customer_name, end_time')
      .eq('status', 'confirmed')
      .lt('end_time', threeHoursAgo)
      .gt('end_time', sevenDaysAgo);
    if (npError) console.warn('anomaly-check 2b:', npError.message);

    if ((neverPickedUp || []).length > 0) {
      anomalies.push({
        severity: 'yellow',
        title: `${neverPickedUp.length} Buchung(en) abgelaufen ohne Abholung — manuell prüfen`,
        detail: 'Bezahlt, kein Precheck, Mietzeit >3h vorbei. Zwei mögliche Ursachen: (1) Nie abgeholt, aber der Auto-Abschluss (send-reminders) greift nicht — Cron kaputt? Spalte bookings.no_show fehlt? GPS-Signal fehlt/veraltet? (2) Kunde hat OHNE Precheck abgeholt (Schloss-Code steht im Vertrags-PDF!) und ist mit dem Anhänger unterwegs. GPS-Position im Admin prüfen, dann manuell entscheiden.',
        list: neverPickedUp.slice(0, 5).map(b =>
          `- ${esc(b.customer_name)} (${esc(b.customer_email)}) · Ende ${new Date(b.end_time).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · ID: ${b.id.slice(0,8)}`
        ).join('\n')
      });
    }

    // 3) Buchungs-Drop-Off
    const { count: thisWeekCount } = await supabase
      .from('bookings').select('*', { count: 'exact', head: true })
      .in('status', ['confirmed','active','returned'])
      .gte('created_at', oneWeekAgo);

    const { count: lastWeekCount } = await supabase
      .from('bookings').select('*', { count: 'exact', head: true })
      .in('status', ['confirmed','active','returned'])
      .gte('created_at', twoWeeksAgo).lt('created_at', oneWeekAgo);

    if ((lastWeekCount || 0) >= 3 && (thisWeekCount || 0) < (lastWeekCount || 0) * 0.5) {
      anomalies.push({
        severity: 'yellow',
        title: 'Buchungs-Drop diese Woche',
        detail: `Letzte Woche: ${lastWeekCount} | Diese Woche: ${thisWeekCount}. Marketing-Kanäle prüfen.`
      });
    }

    // Wenn Anomalien: pushLion() (Subject-Prefix [ST-Alert] für Mail-Filter)
    if (anomalies.length > 0) {
      const hasRed = anomalies.some(a => a.severity === 'red');
      const htmlBody = `
        <p style="color:#888;font-size:.85rem;margin:0 0 16px;">${new Date().toLocaleString('de-DE',{timeZone:'Europe/Berlin'})} Uhr</p>
        ${anomalies.map(a => `
          <div style="background:#1a0a0a;border-left:3px solid ${a.severity==='red'?'#ef4444':'#f59e0b'};border-radius:6px;padding:14px 18px;margin-bottom:14px;">
            <h3 style="margin:0 0 6px;font-size:.95rem;">${a.severity==='red'?'🔴':'🟡'} ${a.title}</h3>
            <p style="margin:0 0 8px;color:#aaa;font-size:.85rem;">${a.detail}</p>
            ${a.list ? `<pre style="background:#0a0a0a;padding:10px;border-radius:6px;font-size:.78rem;color:#bbb;white-space:pre-wrap;margin:8px 0 0;">${a.list}</pre>` : ''}
          </div>
        `).join('')}`;

      await pushLion({
        severity: hasRed ? 'red' : 'yellow',
        category: 'alert',
        title: `${anomalies.length} Anomalie${anomalies.length>1?'n':''} erkannt`,
        htmlBody,
        link: 'https://simpletrailer.de/admin',
      });
    }

    return res.status(200).json({
      ok: true,
      anomalies_count: anomalies.length,
      anomalies: anomalies.map(a => ({ severity: a.severity, title: a.title })),
    });
  } catch (err) {
    console.error('anomaly-check:', err);
    return res.status(500).json({ error: err.message });
  }
};
