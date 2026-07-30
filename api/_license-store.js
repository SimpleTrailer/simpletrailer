/**
 * Speicher-Schicht fuer Fuehrerschein-Bilder (Underscore = kein eigener Endpoint).
 *
 * DATENSCHUTZ — die Leitgedanken hinter dieser Datei:
 *  - Die Bilder liegen in einem PRIVATEN Supabase-Bucket. Es gibt keine oeffentliche
 *    URL; Zugriff nur mit dem Service-Key (also nur serverseitig) oder ueber eine
 *    kurzlebige signierte URL, die wir ausschliesslich dem Admin ausstellen.
 *  - Selfie + Fuehrerscheinfoto sind biometrische Daten (Art. 9 DSGVO). Deshalb
 *    werden sie geloescht, sobald sie ihren Zweck erfuellt haben:
 *      * KI gibt frei          -> sofort loeschen (die ausgelesenen Textdaten reichen)
 *      * Fall geht zu Lion     -> aufbewahren bis er entscheidet, dann loeschen
 *  - Es wird NIE ein Bild an den Kunden oder an Dritte zurueckgegeben.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUCKET = 'driver-licenses';

/**
 * Legt den privaten Bucket an, falls er noch nicht existiert.
 * Spart Lion einen manuellen Schritt im Supabase-Dashboard und ist idempotent.
 */
let bucketChecked = false;
async function ensureBucket() {
  if (bucketChecked) return;
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (!data) {
      await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
      });
    }
  } catch (e) {
    // Existiert bereits oder Race mit einem parallelen Request — beides unkritisch.
    console.warn('ensureBucket:', e.message);
  }
  bucketChecked = true;
}

/** "data:image/jpeg;base64,...." -> { buffer, contentType } */
function parseDataUrl(dataUrl, maxBytes = 6 * 1024 * 1024) {
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Ungültiges Bildformat (nur JPEG, PNG oder WebP).');
  const buffer = Buffer.from(m[3], 'base64');
  if (buffer.length === 0)        throw new Error('Bild ist leer.');
  if (buffer.length > maxBytes)   throw new Error('Bild ist zu groß (max. 6 MB).');
  return { buffer, contentType: m[1] };
}

/**
 * Legt ein Bild ab. Pfad: <user_id>/<zeitstempel>-<art>.<ext>
 * Der Zeitstempel wird uebergeben, damit alle drei Bilder eines Versuchs
 * denselben Praefix teilen und gemeinsam geloescht werden koennen.
 */
async function putImage(userId, stamp, kind, dataUrl) {
  await ensureBucket();
  const { buffer, contentType } = parseDataUrl(dataUrl);
  const ext  = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${stamp}-${kind}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Bild konnte nicht gespeichert werden: ${error.message}`);
  return { path, buffer, contentType };
}

/** Alle Bilder eines Nutzers loeschen (nach Freigabe oder Ablehnung). */
async function deleteUserImages(userId) {
  try {
    const { data: list } = await supabase.storage.from(BUCKET).list(userId, { limit: 200 });
    if (!list || list.length === 0) return 0;
    const paths = list.map(f => `${userId}/${f.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
    return paths.length;
  } catch (e) {
    console.error('deleteUserImages:', e.message);
    return 0;
  }
}

/**
 * Kurzlebige Links fuer die Admin-Handpruefung (Standard 15 Minuten).
 * Bewusst kurz: der Link darf nicht in einem Browser-Verlauf weiterleben.
 */
async function signedUrls(userId, expiresIn = 900) {
  try {
    const { data: list } = await supabase.storage.from(BUCKET).list(userId, { limit: 200 });
    if (!list || list.length === 0) return [];
    // Nur den neuesten Versuch zeigen (gleicher Zeitstempel-Praefix).
    const newestStamp = list
      .map(f => String(f.name).split('-')[0])
      .sort()
      .pop();
    const current = list.filter(f => String(f.name).startsWith(`${newestStamp}-`));
    const out = [];
    for (const f of current) {
      const { data } = await supabase.storage.from(BUCKET)
        .createSignedUrl(`${userId}/${f.name}`, expiresIn);
      if (data?.signedUrl) {
        const kind = /front/.test(f.name) ? 'Vorderseite'
                   : /back/.test(f.name)  ? 'Rückseite'
                   : /selfie/.test(f.name) ? 'Selfie' : f.name;
        out.push({ kind, url: data.signedUrl });
      }
    }
    return out;
  } catch (e) {
    console.error('signedUrls:', e.message);
    return [];
  }
}

module.exports = { BUCKET, putImage, deleteUserImages, signedUrls, parseDataUrl };
