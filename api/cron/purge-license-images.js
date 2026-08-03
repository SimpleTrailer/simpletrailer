/**
 * Cron: Führerschein-Bilder mit Verfallsdatum löschen (stündlich).
 *
 * WARUM ES DIESE DATEI GIBT:
 * Führerschein und Selfie sind biometrische Daten nach Art. 9 DSGVO. Ohne einen
 * Job, der aufräumt, lägen sie unbefristet im Bucket — das wäre weder von der
 * Einwilligung gedeckt noch von der Datenschutzerklärung.
 *
 * AUFBEWAHRUNG (Stand 30.07.2026): 6 Monate ab Upload.
 * Vorher wurden die Bilder direkt nach der Freigabe gelöscht. Das war
 * datensparsam, liess uns im Schadensfall aber ohne jeden Beleg dastehen: Wer
 * hat den Anhänger tatsächlich abgeholt, und haben wir vorher eine gültige
 * Fahrerlaubnis gesehen? Genau das muss belegbar sein — § 21 StVG bestraft den,
 * der jemanden ohne Fahrerlaubnis fahren lässt.
 *
 * Warum 6 Monate: Ansprüche wegen Veränderung oder Verschlechterung der
 * Mietsache verjähren nach § 548 BGB in 6 Monaten. Dieselbe Frist gilt bei uns
 * schon für die Schadens-Fotos aus Precheck und Rückgabe (siehe
 * datenschutz.html Abschnitt 11) — die Führerschein-Bilder liegen jetzt in
 * derselben Systematik statt in einer eigenen.
 *
 * ⚠️ Wird diese Frist geändert, MÜSSEN mitgeändert werden:
 *    - der Einwilligungstext in license-check.js (+ CONSENT_VERSION hochzählen)
 *    - datenschutz.html (Abschnitte „Welche Daten" und „Aufbewahrung")
 * Sonst haben wir eine Einwilligung für etwas anderes als das, was wir tun.
 *
 * Sofort gelöscht wird weiterhin bei: unbrauchbaren Fotos, Ablehnung durch
 * einen Menschen und Konto-Löschung — dort endet der Zweck sofort.
 *
 * Lion wird zusätzlich erinnert, solange ein Fall noch in der Handprüfung
 * hängt: dort wartet ein Kunde, und das soll nicht liegen bleiben.
 */

const { createClient } = require('@supabase/supabase-js');
const { BUCKET } = require('../_license-store.js');
const { readLicense } = require('../_dl.js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const TAGE_MS      = 24 * 3600 * 1000;
const MAX_AGE_MS   = 183 * TAGE_MS;      // 6 Monate — harte Löschgrenze (§ 548 BGB)
const REMIND_AT_MS = 24 * 3600 * 1000;   // ab wann Lion an eine offene Handprüfung erinnert wird

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
      try {
        await pushLion({
          severity: 'yellow',
          category: 'urgent',
          title: `${pending.length} Führerschein-Prüfung${pending.length === 1 ? '' : 'en'} wartet auf dich`,
          htmlBody: `
            <p style="font-size:.95rem;">Diese Kunden warten seit über einem Tag auf deine Entscheidung —
            sie können bis dahin nicht buchen.</p>
            <ul style="font-size:.9rem;line-height:1.8;">
              ${pending.map(p => `<li>${p.email} — wartet ${p.hours} h</li>`).join('')}
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
