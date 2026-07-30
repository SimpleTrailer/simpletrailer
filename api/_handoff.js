/**
 * Übergabe PC → Handy für die Führerschein-Prüfung (Underscore = kein Endpoint).
 *
 * PROBLEM: Am Rechner sitzend ein Dokument abfotografieren ist mühsam — viele
 * Desktops haben gar keine brauchbare Kamera. Der Kunde soll deshalb einen
 * QR-Code scannen und auf dem Handy weitermachen können.
 *
 * LÖSUNG: ein kurzlebiges, signiertes Ticket. Bewusst OHNE Datenbank —
 * das Ticket trägt alles in sich und wird über eine Signatur geprüft:
 *
 *     v1.<userId base64url>.<ablaufZeit>.<signatur>
 *
 * Die Signatur entsteht per HMAC-SHA256 mit einem servereigenen Geheimnis.
 * Niemand kann ein Ticket fälschen, ohne das Geheimnis zu kennen.
 *
 * SICHERHEIT — was das Ticket erlaubt und was nicht:
 *  - ERLAUBT: für genau dieses Konto Führerschein-Fotos einreichen.
 *  - NICHT ERLAUBT: einloggen, Buchungen sehen, irgendetwas anderes tun.
 *  - Läuft nach 15 Minuten ab.
 *  - Der Link enthält keine personenbezogenen Daten im Klartext.
 */

const crypto = require('crypto');

const GUELTIG_MS = 15 * 60 * 1000;   // 15 Minuten

/**
 * Signatur-Geheimnis. Bevorzugt eine eigene Umgebungsvariable; sonst wird der
 * Service-Key genommen — der ist ebenfalls rein serverseitig und nie im Browser.
 */
function secret() {
  const s = process.env.HANDOFF_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!s) throw new Error('Kein Signatur-Geheimnis verfügbar (HANDOFF_SECRET oder SUPABASE_SERVICE_KEY).');
  return s;
}

const b64u  = buf => Buffer.from(buf).toString('base64url');
const unb64 = s   => Buffer.from(String(s), 'base64url').toString('utf8');

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Ticket für einen Nutzer erzeugen. */
function createToken(userId) {
  const exp = Date.now() + GUELTIG_MS;
  const payload = `${b64u(userId)}.${exp}`;
  return `v1.${payload}.${sign(payload)}`;
}

/**
 * Ticket prüfen.
 * @returns {{userId: string}|null}  null = ungültig oder abgelaufen
 */
function verifyToken(token) {
  try {
    const teile = String(token || '').split('.');
    if (teile.length !== 4 || teile[0] !== 'v1') return null;
    const [, idB64, expStr, sig] = teile;

    const payload = `${idB64}.${expStr}`;
    const erwartet = sign(payload);
    // Zeitkonstanter Vergleich — verhindert, dass sich die Signatur über
    // Antwortzeiten Zeichen für Zeichen erraten lässt.
    const a = Buffer.from(sig), b = Buffer.from(erwartet);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Date.now() > exp) return null;

    const userId = unb64(idB64);
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
    return { userId, expiresAt: new Date(exp).toISOString() };
  } catch (e) {
    return null;
  }
}

/**
 * QR-Code als SVG. Bewusst serverseitig erzeugt und als fertiges SVG
 * ausgeliefert — kein externer Dienst, keine Bibliothek im Browser,
 * keine Datenübermittlung an Dritte (DSGVO).
 */
async function qrSvg(text) {
  const QRCode = require('qrcode');
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260,
    color: { dark: '#111213', light: '#FFFFFF' }
  });
}

module.exports = { createToken, verifyToken, qrSvg, GUELTIG_MS };
