/**
 * SimpleTrailer — Resend Webhook (Bounce-/Beschwerde-Meldung)
 *
 * Zweck: Wenn eine transaktionale Mail (Mietvertrag, Rechnung, Zugangscode …)
 * NICHT zustellbar ist — z.B. weil der Kunde sich bei der Adresse vertippt hat —
 * soll Lion das SOFORT erfahren, damit er den Kunden anrufen / korrigieren kann.
 * So wird eine falsch eingegebene Mail harmlos statt zum stillen Vertragsverlust.
 *
 * Reagiert auf:
 *   - email.bounced     → harte Unzustellbarkeit (Tippfehler, Postfach voll/gesperrt)
 *   - email.complained  → Empfänger hat als Spam markiert
 *
 * Einrichtung (einmalig durch Lion, siehe NEXT-STEPS):
 *   1) Resend → Webhooks → Add Endpoint:  https://www.simpletrailer.de/api/resend-webhook
 *      Events: email.bounced, email.complained
 *   2) Resend zeigt ein "Signing Secret" (whsec_…) → als ENV RESEND_WEBHOOK_SECRET
 *      in Vercel hinterlegen. Ohne Secret läuft es trotzdem (nur ungeprüft).
 *
 * Underscore-Konvention gilt hier NICHT — diese Datei MUSS als Route erreichbar sein.
 */
const crypto = require('crypto');
const { pushLion } = require('./_lion-push.js');

// Raw body wird für die Svix-Signaturprüfung gebraucht (wie beim Stripe-Webhook).
export const config = { api: { bodyParser: false } };

const getRawBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => resolve(data));
  req.on('error', reject);
});

/**
 * Svix-Signatur prüfen (Resend nutzt Svix).
 * Signierter Inhalt: `${svixId}.${svixTimestamp}.${rawBody}`
 * Header `svix-signature` ist eine Leerzeichen-Liste aus `v1,<base64>`.
 */
function verifySvix(rawBody, headers, secret) {
  if (!secret) return false; // fail-closed — ohne Secret wird nichts verarbeitet (Handling im Handler)
  try {
    const id = headers['svix-id'];
    const ts = headers['svix-timestamp'];
    const sigHeader = headers['svix-signature'];
    if (!id || !ts || !sigHeader) return false;

    // Replay-Schutz: Zeitstempel darf nicht älter als 5 Min sein (Svix-Standard).
    const ageSec = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(ageSec) || ageSec > 300) return false;

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signedContent = `${id}.${ts}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

    // Header kann mehrere Signaturen enthalten (Key-Rotation) → eine muss passen.
    return sigHeader.split(' ').some(part => {
      const sig = part.split(',')[1] || part; // "v1,<base64>" → "<base64>"
      try {
        return sig.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch (_) { return false; }
    });
  } catch (e) {
    console.error('resend-webhook: Signaturprüfung fehlgeschlagen:', e.message);
    return false;
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);

  // Fail-closed, solange das Secret noch nicht in Vercel hinterlegt ist: Events ignorieren,
  // aber 200 zurückgeben (kein Resend-Retry-Loop). Sonst wäre das ein offener
  // "Schick-Lion-eine-Urgent-Mail"-Endpoint für jedermann.
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    console.warn('resend-webhook: RESEND_WEBHOOK_SECRET fehlt — Event ignoriert (fail-closed).');
    return res.status(200).json({ ok: true, ignored: 'no_secret' });
  }

  if (!verifySvix(rawBody, req.headers, process.env.RESEND_WEBHOOK_SECRET)) {
    console.error('resend-webhook: ungültige Signatur — abgelehnt');
    return res.status(401).send('invalid signature');
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch (_) { return res.status(400).send('bad json'); }

  const type = event?.type || '';
  // Nur echte Zustell-Probleme melden — alles andere bestätigen wir nur (200).
  if (type !== 'email.bounced' && type !== 'email.complained') {
    return res.status(200).json({ ok: true, ignored: type });
  }

  try {
    const data = event.data || {};
    const to = Array.isArray(data.to) ? data.to.join(', ') : (data.to || '–');
    const subject = data.subject || '–';
    const reason =
      data.bounce?.message || data.bounce?.subType || data.bounce?.type ||
      data.reason || (type === 'email.complained' ? 'Als Spam markiert' : 'Unbekannt');

    const isComplaint = type === 'email.complained';
    const title = isComplaint
      ? 'Kunde hat eine Mail als Spam markiert'
      : 'E-Mail kam NICHT an (Bounce)';

    const htmlBody = `
      <p style="margin:0 0 12px">${isComplaint
        ? 'Ein Empfänger hat eine SimpleTrailer-Mail als Spam markiert.'
        : 'Eine transaktionale Mail (evtl. <b>Mietvertrag / Rechnung / Zugangscode</b>) konnte <b>nicht zugestellt</b> werden — wahrscheinlich ein Tippfehler in der Adresse.'}</p>
      <table style="width:100%;font-size:.9rem;line-height:1.6">
        <tr><td style="color:#999;padding:2px 0;width:120px">Empfänger</td><td><b>${esc(to)}</b></td></tr>
        <tr><td style="color:#999;padding:2px 0">Betreff</td><td>${esc(subject)}</td></tr>
        <tr><td style="color:#999;padding:2px 0">Grund</td><td>${esc(reason)}</td></tr>
      </table>
      ${isComplaint ? '' : '<p style="margin:14px 0 0">👉 <b>Kunde anrufen</b> oder richtige Adresse erfragen und Vertrag/Rechnung erneut senden, damit ihm nichts fehlt.</p>'}`;

    await pushLion({
      severity: isComplaint ? 'yellow' : 'red',
      category: 'urgent',
      title,
      htmlBody,
      link: 'https://www.simpletrailer.de/admin',
    });

    console.log(`resend-webhook: ${type} → Lion benachrichtigt (${to})`);
  } catch (e) {
    // Niemals 5xx zurückgeben → sonst wiederholt Resend den Webhook im Dauer-Loop.
    console.error('resend-webhook: Benachrichtigung fehlgeschlagen:', e.message);
  }

  return res.status(200).json({ ok: true });
};
