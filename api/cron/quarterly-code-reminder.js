/**
 * Quartals-Reminder: Schloss-Codes wechseln
 *
 * Läuft 1x pro Quartal (1. Januar, April, Juli, Oktober um 9 Uhr).
 * Schickt eine Mail an die Admin-Mailbox mit Erinnerung den physischen
 * Schloss-Code zu wechseln + neuen Code im Admin-Flotte-Tab einzutragen.
 *
 * Begründung: bei festen Codes pro Anhänger kennen alle vergangenen Mieter
 * den Code dauerhaft. Quartalsweiser Wechsel limitiert das Risiko.
 *
 * Auth: Bearer CRON_SECRET (gleiche Mechanik wie alle Crons).
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  // Cron-Auth
  const auth = req.headers.authorization || '';
  const token = (auth.match(/^Bearer\s+(.+)$/i)?.[1])
             || req.headers['x-cron-token']
             || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Aktuelle Codes aus DB laden
    const { data: trailers } = await supabase
      .from('trailers')
      .select('id, name, access_code')
      .order('name');

    const list = (trailers || []).map(t =>
      `- ${t.name}: aktueller Code ${t.access_code || 'KEIN CODE GESETZT'}`
    ).join('\n');

    const quarter = Math.floor(new Date().getMonth() / 3) + 1;
    const year = new Date().getFullYear();

    await resend.emails.send({
      from: 'SimpleTrailer Cockpit <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: 'info@simpletrailer.de',
      subject: `[ST-Routine] Schloss-Codes wechseln — Q${quarter}/${year}`,
      text: `Hi,

es ist Zeit die physischen Schloss-Codes an den Anhängern zu wechseln.

Warum: bei festen Codes pro Anhänger kennen alle Ex-Mieter den Code dauerhaft.
Quartalsweiser Wechsel limitiert das Risiko (Diebstahl von Komponenten, etc.).

So gehts:
1. Zum Stellplatz fahren, Schloss-Räder auf neuen 4-stelligen Code einstellen
2. Im Admin-Dashboard → Flotte-Tab → Anhänger bearbeiten → neuen Code eintragen
3. Bis dahin: aktive Buchungen sehen weiter den alten Code (DB-Stand)

Aktuelle Codes:
${list || '(keine Anhänger gefunden)'}

— SimpleTrailer Cockpit (automatischer Quartals-Reminder)`,
      html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0D0D0D;color:#fff;margin:0;padding:30px 20px;">
        <div style="max-width:560px;margin:0 auto;background:#1A1A1A;border:1px solid #383838;border-radius:14px;padding:28px;">
          <div style="text-align:center;margin-bottom:20px;">
            <span style="font-size:1.3rem;font-weight:800;">Simple</span><span style="font-size:1.3rem;font-weight:800;color:#E85D00;">Trailer</span>
            <p style="color:#888;font-size:.78rem;margin:6px 0 0;letter-spacing:.08em;text-transform:uppercase;">Cockpit · Q${quarter}/${year}</p>
          </div>
          <h1 style="margin:0 0 8px;font-size:1.2rem;">🔐 Schloss-Codes wechseln</h1>
          <p style="color:#aaa;font-size:.88rem;margin:0 0 18px;line-height:1.55;">
            Quartalsreminder. Ex-Mieter kennen die aktuellen Codes — Zeit für einen Wechsel.
          </p>
          <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:10px;padding:14px 18px;margin-bottom:18px;">
            <p style="color:#fbbf24;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px;">Aktuelle Codes</p>
            <pre style="font-family:'SF Mono',Consolas,monospace;color:#fff;font-size:.85rem;margin:0;white-space:pre-wrap;">${list || '(keine Anhänger gefunden)'}</pre>
          </div>
          <ol style="font-size:.86rem;color:#ddd;line-height:1.65;padding-left:22px;">
            <li>Zum Stellplatz fahren, Schloss-Räder auf neuen Code drehen</li>
            <li>Admin-Dashboard → <strong>🚛 Flotte</strong> → Anhänger bearbeiten → neuen Code eintragen</li>
            <li>Fertig — neue Mieter bekommen den neuen Code automatisch in der Buchungsmail</li>
          </ol>
          <p style="margin-top:18px;text-align:center;">
            <a href="https://simpletrailer.de/admin" style="display:inline-block;background:#E85D00;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;">Zum Admin-Dashboard →</a>
          </p>
        </div>
      </body></html>`
    });

    return res.status(200).json({ ok: true, trailers_count: (trailers || []).length });
  } catch (err) {
    console.error('quarterly-code-reminder:', err);
    return res.status(500).json({ error: err.message });
  }
};
