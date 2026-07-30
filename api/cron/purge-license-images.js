/**
 * Cron: Führerschein-Bilder mit Verfallsdatum löschen (stündlich).
 *
 * WARUM:
 * Im Normalfall verschwinden die Bilder sofort — bei automatischer Freigabe,
 * bei „bitte neu fotografieren", und wenn Lion im Admin entscheidet. Bleibt ein
 * Fall aber in der Handprüfung liegen (Urlaub, übersehene Mail, Kunde springt
 * ab), lagen Führerschein und Selfie bisher UNBEFRISTET im Bucket. Das sind
 * biometrische Daten nach Art. 9 DSGVO, und unsere Datenschutzerklärung sagt
 * ausdrücklich, dass sie nach der Prüfung gelöscht werden.
 *
 * Diese Datei setzt eine harte Obergrenze: nach 72 Stunden ist Schluss,
 * unabhängig davon, ob jemand entschieden hat. Lion bekommt vorher eine
 * Erinnerung, damit ihm kein Fall durchrutscht.
 *
 * Die Prüfung selbst bleibt möglich — Lion kann im Admin weiterhin freigeben
 * oder ablehnen, er sieht dann nur keine Bilder mehr und muss den Kunden bitten,
 * sie neu hochzuladen.
 */

const { createClient } = require('@supabase/supabase-js');
const { BUCKET } = require('../_license-store.js');
const { readLicense } = require('../_dl.js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MAX_AGE_MS   = 72 * 3600 * 1000;   // harte Löschgrenze
const REMIND_AT_MS = 24 * 3600 * 1000;   // ab wann Lion erinnert wird

module.exports = async (req, res) => {
  // Cron-Schutz wie bei den anderen Jobs
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const given = (req.headers.authorization || '').replace('Bearer ', '');
    if (given !== secret) return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const now = Date.now();
  let deleted = 0, kept = 0, reminders = 0;
  const pending = [];

  try {
    // Alle Nutzer-Ordner im Bucket durchgehen
    const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
    if (error) {
      // Bucket existiert noch nicht (noch keine Prüfung gelaufen) — kein Fehler.
      if (/not found/i.test(error.message)) return res.status(200).json({ ok: true, note: 'Bucket existiert noch nicht' });
      throw error;
    }

    for (const folder of folders || []) {
      const userId = folder.name;
      if (!/^[0-9a-f-]{36}$/i.test(userId)) continue;

      const { data: files } = await supabase.storage.from(BUCKET).list(userId, { limit: 200 });
      if (!files || files.length === 0) continue;

      // Der Dateiname beginnt mit dem Zeitstempel des Versuchs (siehe _license-store.js)
      const stamps = files
        .map(f => parseInt(String(f.name).split('-')[0], 10))
        .filter(n => Number.isFinite(n));
      const newest = stamps.length ? Math.max(...stamps) : 0;
      const ageMs  = now - newest;

      if (ageMs > MAX_AGE_MS) {
        await supabase.storage.from(BUCKET).remove(files.map(f => `${userId}/${f.name}`));
        deleted += files.length;
        console.log(`purge-license-images: ${files.length} Bild(er) von ${userId} nach ${Math.round(ageMs / 3600000)} h gelöscht.`);
      } else {
        kept += files.length;
        if (ageMs > REMIND_AT_MS) {
          try {
            const { data: u } = await supabase.auth.admin.getUserById(userId);
            if (u?.user && readLicense(u.user).dl_status === 'review') {
              pending.push({ email: u.user.email, hours: Math.round(ageMs / 3600000) });
            }
          } catch (e) { /* Nutzer existiert nicht mehr — Bilder laufen ohnehin ab */ }
        }
      }
    }

    // Eine gesammelte Erinnerung statt vieler Einzelmails
    if (pending.length > 0) {
      reminders = pending.length;
      const rest = h => Math.max(0, 72 - h);
      try {
        await pushLion({
          severity: 'yellow',
          category: 'urgent',
          title: `${pending.length} Führerschein-Prüfung${pending.length === 1 ? '' : 'en'} wartet auf dich`,
          htmlBody: `
            <p style="font-size:.95rem;">Diese Kunden warten seit über einem Tag auf deine Entscheidung.
            Die hochgeladenen Bilder werden aus Datenschutzgründen nach 72 Stunden automatisch gelöscht —
            danach müsste der Kunde sie neu hochladen.</p>
            <ul style="font-size:.9rem;line-height:1.8;">
              ${pending.map(p => `<li>${p.email} — wartet ${p.hours} h (Bilder noch ${rest(p.hours)} h verfügbar)</li>`).join('')}
            </ul>`,
          link: 'https://simpletrailer.de/admin'
        });
      } catch (e) { console.error('purge-license-images: Erinnerung fehlgeschlagen:', e.message); }
    }

    return res.status(200).json({ ok: true, deleted, kept, reminders });
  } catch (err) {
    console.error('purge-license-images:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
