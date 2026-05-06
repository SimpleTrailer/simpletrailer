/**
 * SimpleTrailer Cron: Termin-Watcher Bremen Zulassungsstelle
 *
 * Läuft jede Minute (Vercel Pro). Lädt service.bremen.de URL,
 * parst kleinstes verfügbares Datum, vergleicht mit Deadline.
 *
 * Bei Treffer (Datum vor termin_watcher_state.bremen_termin_deadline)
 * UND Datum hat sich geändert seit letzter Push: Mail mit Direkt-Link.
 *
 * VORAUSSETZUNG:
 * - ENV: CRON_SECRET
 * - Tabelle termin_watcher_state mit bremen_termin_deadline (Spalte aus
 *   supabase-migration-bremen-deadline.sql, im Admin pflegbar)
 * - Fallback wenn Spalte leer: ENV TERMIN_WATCH_DEADLINE oder '2026-05-19'
 */
const { createClient } = require('@supabase/supabase-js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const TERMIN_URL = 'https://www.service.bremen.de/dienstleistungen/kraftfahrzeug-anmelden-8389?template=20_sp_dienstleistungen_termine_d&typ=kurz';

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Deadline aus DB lesen (im Admin pflegbar). Fallback: ENV / hardcoded.
  let deadlineStr = null;
  try {
    const { data: stateRow } = await supabase
      .from('termin_watcher_state')
      .select('bremen_termin_deadline')
      .eq('id', 1)
      .maybeSingle();
    if (stateRow?.bremen_termin_deadline) {
      deadlineStr = stateRow.bremen_termin_deadline;
    }
  } catch (e) {
    // Spalte evtl. noch nicht migriert — fallback unten
  }
  if (!deadlineStr) {
    deadlineStr = process.env.TERMIN_WATCH_DEADLINE || '2026-05-19';
  }
  const deadline = new Date(deadlineStr + 'T23:59:59');

  try {
    // Bremen-Seite holen — User-Agent setzen damit nicht 403
    const r = await fetch(TERMIN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SimpleTrailerWatch/1.0; +info@simpletrailer.de)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
    });

    if (!r.ok) {
      // State updaten mit Fehler-Counter
      await supabase.from('termin_watcher_state').upsert({
        id: 1,
        last_check_at: new Date().toISOString(),
        consecutive_errors: { increment: 1 }
      }, { onConflict: 'id' }).select();
      return res.status(200).json({ ok: false, http_status: r.status, msg: 'fetch failed (transient)' });
    }

    const html = await r.text();

    // Defensive Parsing: alle DD.MM.YYYY-Vorkommen extrahieren, kleinstes Zukunfts-Datum
    const matches = [...html.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(202[6-9])\b/g)];
    const dates = matches
      .map(m => {
        const day = m[1].padStart(2, '0');
        const month = m[2].padStart(2, '0');
        const d = new Date(`${m[3]}-${month}-${day}T12:00:00`);
        return isNaN(d) ? null : d;
      })
      .filter(d => d && d > new Date());

    const earliest = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
    const earliestStr = earliest ? earliest.toISOString().slice(0, 10) : null;

    // Aktuellen State holen
    const { data: state } = await supabase
      .from('termin_watcher_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    const lastPushed = state?.last_pushed_date ? new Date(state.last_pushed_date + 'T12:00:00') : null;

    // Update State (last_check + last_earliest)
    await supabase.from('termin_watcher_state').upsert({
      id: 1,
      last_check_at: new Date().toISOString(),
      last_earliest_date: earliestStr,
      consecutive_errors: 0,
    }, { onConflict: 'id' });

    // Trigger-Bedingung: Datum vorhanden + vor Deadline + verschieden zu last_pushed
    if (!earliest) {
      return res.status(200).json({ ok: true, no_dates_found: true });
    }
    if (earliest >= deadline) {
      return res.status(200).json({ ok: true, earliest: earliestStr, before_deadline: false });
    }
    if (lastPushed && earliest.getTime() === lastPushed.getTime()) {
      // Schon gemeldet, nicht doppelt pushen
      return res.status(200).json({ ok: true, earliest: earliestStr, already_pushed: true });
    }

    // ALARM!
    const dayLabel = earliest.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const daysFromNow = Math.ceil((earliest - new Date()) / 86400000);

    await pushLion({
      severity: 'critical',
      category: 'urgent',
      title: `Bremen-Zulassung: Termin am ${dayLabel}`,
      htmlBody: `
        <p style="font-size:1rem;"><strong>Frühster freier Termin: ${dayLabel}</strong> (in ${daysFromNow} Tag${daysFromNow > 1 ? 'en' : ''})</p>
        <p>SCHNELL klicken — Termine sind oft in Sekunden weg.</p>
        <p style="background:#1f0a0a;border-left:3px solid #ef4444;padding:12px;border-radius:6px;margin:16px 0;font-size:.85rem;">
          <strong>So gehst Du vor:</strong><br>
          1. Direkt-Link unten klicken<br>
          2. Termin-Slot auswählen + Daten eintragen<br>
          3. Bestätigungs-Mail innerhalb 1h klicken sonst Slot weg
        </p>
      `,
      link: TERMIN_URL,
    });

    // last_pushed updaten
    await supabase.from('termin_watcher_state').upsert({
      id: 1,
      last_pushed_date: earliestStr,
    }, { onConflict: 'id' });

    return res.status(200).json({ ok: true, earliest: earliestStr, alerted: true });
  } catch (err) {
    console.error('termin-watcher:', err);
    return res.status(500).json({ error: err.message });
  }
};
