/**
 * SimpleTrailer Cron: Tracker-Watchdog
 *
 * Laeuft alle 30 Min. Prueft fuer jeden Trailer mit IMEI ob:
 *   - last_seen_at > 6h alt  → wahrscheinlich offline (Batterie leer, Antenne ab, abgeklemmt)
 *   - last_battery_percent < 20 → wird bald sterben
 *
 * Bei Treffer: Mail + Push an Lion. Anti-Spam: gleiche Warnung max. 1x pro 12h.
 *
 * Diebstahl-Logik liegt im sync-tracker-positions-Cron — der laeuft jede Minute
 * und alarmiert bei unautorisierter Bewegung. Watchdog ergaenzt das um den
 * Sonderfall "Tracker tot statt geklaut".
 */
const { createClient } = require('@supabase/supabase-js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const OFFLINE_THRESHOLD_HOURS  = 6;
const BATTERY_THRESHOLD_PERCENT = 20;
const ALERT_COOLDOWN_HOURS      = 12;

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1]) || req.headers['x-cron-token'] || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: trailers, error } = await supabase
      .from('trailers')
      .select('id, name, tracker_imei, last_seen_at, last_battery_percent, last_lat, last_lng')
      .not('tracker_imei', 'is', null);
    if (error) throw error;

    const nowMs   = Date.now();
    const cooldownMs = ALERT_COOLDOWN_HOURS * 3600 * 1000;
    let alertsFired = 0;

    for (const t of trailers || []) {
      const issues = [];

      // 1) Offline-Check
      if (t.last_seen_at) {
        const ageHours = (nowMs - new Date(t.last_seen_at).getTime()) / 3600000;
        if (ageHours > OFFLINE_THRESHOLD_HOURS) {
          issues.push({
            type: 'offline',
            severity: ageHours > 24 ? 'critical' : 'yellow',
            msg: `Tracker hat seit ${Math.round(ageHours)}h kein Signal gesendet.`
          });
        }
      } else {
        issues.push({ type: 'offline', severity: 'critical', msg: 'Tracker hat NIE ein Signal gesendet.' });
      }

      // 2) Battery-Check
      if (t.last_battery_percent != null && t.last_battery_percent < BATTERY_THRESHOLD_PERCENT) {
        issues.push({
          type: 'battery_low',
          severity: t.last_battery_percent < 10 ? 'critical' : 'yellow',
          msg: `Batterie nur noch ${t.last_battery_percent}% — bald tot.`
        });
      }

      for (const issue of issues) {
        // Anti-Spam: gleichen Alarm-Typ fuer diesen Trailer max. 1x pro Cooldown senden
        const sinceIso = new Date(nowMs - cooldownMs).toISOString();
        const { data: recent } = await supabase
          .from('tracker_alerts')
          .select('id')
          .eq('trailer_id', t.id)
          .eq('alert_type', issue.type)
          .gte('created_at', sinceIso)
          .limit(1);

        if (recent && recent.length > 0) continue;

        // Alarm-Log + Mail+Push
        await supabase.from('tracker_alerts').insert({
          trailer_id: t.id,
          alert_type: issue.type,
          severity:   issue.severity,
          message:    issue.msg
        });

        const mapsLink = (t.last_lat && t.last_lng)
          ? `https://www.google.com/maps?q=${t.last_lat},${t.last_lng}`
          : null;

        await pushLion({
          severity: issue.severity,
          category: 'urgent',
          title: `${issue.type === 'offline' ? '📡' : '🔋'} Tracker-Problem: ${t.name}`,
          htmlBody: `
            <p><strong>${t.name}</strong>: ${issue.msg}</p>
            <p style="background:#0a1a2a;border-left:3px solid #60a5fa;padding:12px;border-radius:6px;margin:14px 0;">
              <strong>Letztes Signal:</strong> ${t.last_seen_at ? new Date(t.last_seen_at).toLocaleString('de-DE') : '— nie —'}<br>
              <strong>Letzte Batterie:</strong> ${t.last_battery_percent != null ? t.last_battery_percent + '%' : '—'}<br>
              <strong>IMEI:</strong> <code>${t.tracker_imei}</code>
              ${mapsLink ? `<br><strong>Letzter Standort:</strong> <a href="${mapsLink}" style="color:#60a5fa;">Google Maps oeffnen</a>` : ''}
            </p>
            <p><strong>So vorgehen:</strong></p>
            <ol>
              <li>Vor Ort fahren und Tracker physisch pruefen (sitzt fest? Lampe?)</li>
              <li>Batterie / Verkabelung pruefen</li>
              <li>Notfalls Ersatz-Tracker einbauen — IMEI in Supabase aktualisieren</li>
            </ol>
            <p style="color:#888;font-size:.85rem;">Naechster Check fuer diesen Alarm-Typ: in ${ALERT_COOLDOWN_HOURS}h (Anti-Spam).</p>
          `,
          link: mapsLink || undefined,
        });

        alertsFired++;
      }
    }

    return res.status(200).json({
      ok: true,
      trailers_checked: trailers?.length || 0,
      alerts_fired: alertsFired
    });
  } catch (err) {
    console.error('tracker-watchdog:', err);
    return res.status(500).json({ error: err.message });
  }
};
