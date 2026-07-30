/**
 * EINMALIGE MIGRATION — Führerschein-Daten von user_metadata nach app_metadata.
 *
 * WARUM:
 * `user_metadata` ist in Supabase vom Kunden selbst beschreibbar (PUT /auth/v1/user
 * mit dem eigenen Token). Solange dl_status dort lag, konnte sich jeder selbst auf
 * "verified" setzen und ohne Führerschein buchen. Seit 30.07.2026 liest und
 * schreibt der Code nur noch `app_metadata` (siehe api/_dl.js) — das ist
 * ausschliesslich mit dem Service-Key beschreibbar.
 *
 * OHNE DIESE MIGRATION stehen alle bereits verifizierten Bestandskunden nach dem
 * Deploy auf "unverified" und koennen nicht mehr buchen.
 *
 * WAS DAS SKRIPT TUT:
 *   1. Alle Nutzer durchgehen
 *   2. dl_*-Felder + mollie_customer_id aus user_metadata nach app_metadata kopieren
 *      (vorhandene app_metadata-Werte gewinnen — die sind bereits die neue Wahrheit)
 *   3. Die Felder aus user_metadata ENTFERNEN, damit die Lücke geschlossen ist
 *
 * AUSFÜHREN:
 *   Erst zur Kontrolle (ändert nichts):
 *     node scripts/migrate-dl-to-app-metadata.js
 *   Dann wirklich schreiben:
 *     node scripts/migrate-dl-to-app-metadata.js --apply
 *
 * Braucht SUPABASE_URL und SUPABASE_SERVICE_KEY in der Umgebung, z.B. über
 *   vercel env pull .env.local
 */

const { createClient } = require('@supabase/supabase-js');
const { SERVER_OWNED } = require('../api/_dl.js');

const APPLY = process.argv.includes('--apply');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL und SUPABASE_SERVICE_KEY müssen gesetzt sein.');
  console.error('Tipp:  vercel env pull .env.local   und dann die Werte exportieren.');
  process.exit(1);
}
const supabase = createClient(url, key);

(async () => {
  console.log(APPLY ? '=== MIGRATION (schreibt wirklich) ===' : '=== PROBELAUF (ändert nichts) ===');

  let page = 1, total = 0, touched = 0, verified = 0;
  const problems = [];

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error('Nutzer konnten nicht gelesen werden:', error.message); process.exit(1); }
    const users = data?.users || [];
    if (users.length === 0) break;

    for (const u of users) {
      total++;
      const um  = { ...(u.user_metadata || {}) };
      const app = { ...(u.app_metadata  || {}) };

      const toMove = SERVER_OWNED.filter(k => um[k] !== undefined);
      if (toMove.length === 0) continue;

      // app_metadata ist die neue Wahrheit — bestehende Werte NICHT überschreiben.
      const nextApp = { ...app };
      // ACHTUNG: updateUserById MISCHT user_metadata, es ersetzt sie nicht.
      // Ein `delete` im Objekt bleibt dadurch wirkungslos — die Felder müssen
      // ausdrücklich auf null gesetzt werden, damit sie wirklich verschwinden.
      const clearUm = {};
      for (const k of toMove) {
        if (nextApp[k] === undefined) nextApp[k] = um[k];
        clearUm[k] = null;
      }

      const status = nextApp.dl_status || 'unverified';
      if (status === 'verified') verified++;
      touched++;

      console.log(`  ${u.email}  (${status})  →  ${toMove.length} Feld(er): ${toMove.join(', ')}`);

      if (APPLY) {
        // Zwei getrennte Aufrufe: app_metadata zuerst setzen, damit der Nutzer zu
        // KEINEM Zeitpunkt ohne Berechtigung dasteht, falls der zweite Aufruf scheitert.
        const r1 = await supabase.auth.admin.updateUserById(u.id, { app_metadata: nextApp });
        if (r1.error) { problems.push(`${u.email}: app_metadata — ${r1.error.message}`); continue; }
        const r2 = await supabase.auth.admin.updateUserById(u.id, { user_metadata: clearUm });
        if (r2.error) problems.push(`${u.email}: user_metadata aufräumen — ${r2.error.message}`);
      }
    }

    if (users.length < 200) break;
    page++;
  }

  console.log('');
  console.log(`Nutzer gesamt:        ${total}`);
  console.log(`Zu migrieren:         ${touched}`);
  console.log(`davon 'verified':     ${verified}`);
  if (problems.length) {
    console.log('');
    console.log('PROBLEME:');
    problems.forEach(p => console.log('  ' + p));
    process.exit(1);
  }
  console.log('');
  console.log(APPLY
    ? 'Fertig. Bitte im Admin stichprobenartig prüfen, dass die Kunden weiter als verifiziert erscheinen.'
    : 'Probelauf beendet — es wurde NICHTS geändert. Zum Schreiben mit --apply erneut starten.');
})().catch(e => { console.error('ABBRUCH:', e.message); process.exit(1); });
