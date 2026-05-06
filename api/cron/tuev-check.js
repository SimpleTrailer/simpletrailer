/**
 * SimpleTrailer Cron: TÜV/Wartungs-Check
 *
 * Läuft täglich 7:00 UTC (= 9:00 Berlin).
 * Prüft pro Anhänger ob TÜV oder Wartung in [30, 14, 7, 1] Tagen ansteht.
 * Bei Fälligkeit: Mail an Lion + last_*_alert_sent_for_date setzen (Dedup).
 *
 * VORAUSSETZUNG: trailers-Spalten next_tuev_date, next_maintenance_date,
 * last_tuev_alert_sent_for_date, last_maint_alert_sent_for_date
 * (siehe supabase-migration-phase2-ausbau.sql).
 */
const { createClient } = require('@supabase/supabase-js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ALERT_DAYS = [30, 14, 7, 1];

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return Math.ceil((d - new Date()) / 86400000);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '–';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
};

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
    const { data: trailers } = await supabase.from('trailers').select(
      'id, name, next_tuev_date, next_maintenance_date, last_tuev_alert_sent_for_date, last_maint_alert_sent_for_date'
    );

    let alerts = 0;
    for (const t of trailers || []) {
      // TÜV-Check
      const tuevDays = daysUntil(t.next_tuev_date);
      if (tuevDays !== null && ALERT_DAYS.includes(tuevDays)) {
        // Dedup: nur wenn nicht schon für DIESES Datum gemailt
        if (t.last_tuev_alert_sent_for_date !== t.next_tuev_date) {
          const severity = tuevDays <= 7 ? 'red' : 'yellow';
          await pushLion({
            severity,
            category: tuevDays <= 7 ? 'urgent' : 'routine',
            title: `TÜV ${t.name}: in ${tuevDays} Tag${tuevDays === 1 ? '' : 'en'}`,
            htmlBody: `
              <p>Anhänger <strong>${t.name}</strong> hat TÜV-Termin am <strong>${formatDate(t.next_tuev_date)}</strong>.</p>
              <p>Das ist in <strong>${tuevDays} Tag${tuevDays === 1 ? '' : 'en'}</strong>.</p>
              <p>Bitte Termin bei einer DEKRA/TÜV-Stelle in Bremen vereinbaren.</p>
            `,
          });
          await supabase.from('trailers')
            .update({ last_tuev_alert_sent_for_date: t.next_tuev_date })
            .eq('id', t.id);
          alerts++;
        }
      }

      // Wartungs-Check
      const maintDays = daysUntil(t.next_maintenance_date);
      if (maintDays !== null && ALERT_DAYS.includes(maintDays)) {
        if (t.last_maint_alert_sent_for_date !== t.next_maintenance_date) {
          await pushLion({
            severity: maintDays <= 7 ? 'red' : 'yellow',
            category: maintDays <= 7 ? 'urgent' : 'routine',
            title: `Wartung ${t.name}: in ${maintDays} Tag${maintDays === 1 ? '' : 'en'}`,
            htmlBody: `
              <p>Anhänger <strong>${t.name}</strong> hat Wartungs-Termin am <strong>${formatDate(t.next_maintenance_date)}</strong>.</p>
              <p>Das ist in <strong>${maintDays} Tag${maintDays === 1 ? '' : 'en'}</strong>.</p>
            `,
          });
          await supabase.from('trailers')
            .update({ last_maint_alert_sent_for_date: t.next_maintenance_date })
            .eq('id', t.id);
          alerts++;
        }
      }
    }

    return res.status(200).json({ ok: true, trailers_checked: (trailers || []).length, alerts });
  } catch (err) {
    console.error('tuev-check:', err);
    return res.status(500).json({ error: err.message });
  }
};
