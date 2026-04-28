const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { sendPushToUser } = require('./_push-sender.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

const fmt = (d) => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Sicherheits-Token damit der Endpunkt nicht offen zugänglich ist.
  // Vercel-Cron sendet automatisch "Authorization: Bearer <CRON_SECRET>";
  // zusätzlich akzeptieren wir x-cron-token / ?token= für manuelles Triggern.
  const auth        = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now      = new Date();
    const in60min  = new Date(now.getTime() + 60 * 60 * 1000);
    const in90min  = new Date(now.getTime() + 90 * 60 * 1000);

    // Buchungen die in 60–90 Minuten enden und noch keine Erinnerung bekommen haben
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ['confirmed', 'active'])
      .eq('reminder_sent', false)
      .gte('end_time', in60min.toISOString())
      .lte('end_time', in90min.toISOString());

    if (error) throw error;

    let sent = 0;
    for (const b of bookings || []) {
      try {
        await resend.emails.send({
          from: 'SimpleTrailer <buchung@simpletrailer.de>',
          reply_to: 'info@simpletrailer.de',
          to: b.customer_email,
          subject: `⏰ Erinnerung: Anhänger-Rückgabe in ca. 1 Stunde – SimpleTrailer`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
            <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
              <div style="text-align:center;margin-bottom:32px;">
                <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
              </div>
              <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;">
                <h1 style="margin:0 0 8px;font-size:1.3rem;">⏰ Rückgabe in ca. 1 Stunde</h1>
                <p style="color:#888;margin:0 0 24px;">Hallo ${b.customer_name}, deine Mietzeit endet bald.</p>

                <div style="background:#111;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="color:#888;padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Buchung</td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">#${b.id.slice(0,8).toUpperCase()}</td></tr>
                    <tr><td style="color:#888;padding:8px 0;font-size:.88rem;">Rückgabe bis</td><td style="text-align:right;padding:8px 0;font-weight:800;color:#E85D00;font-size:.95rem;">${fmt(b.end_time)} Uhr</td></tr>
                  </table>
                </div>

                <div style="background:#1a0d00;border:1.5px solid #E85D00;border-radius:12px;padding:20px;margin-bottom:20px;">
                  <p style="color:#E85D00;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 8px;">Wichtiger Hinweis</p>
                  <p style="margin:0;font-size:.9rem;line-height:1.6;">Bitte gib den Anhänger <strong>pünktlich bis ${fmt(b.end_time)} Uhr</strong> zurück.</p>
                  <p style="margin:10px 0 0;font-size:.85rem;color:#f87171;font-weight:600;">Bei verspäteter Rückgabe berechnen wir <strong>15 € pro angefangene Stunde</strong>.</p>
                </div>

                <a href="${process.env.SITE_URL || 'https://simpletrailer.de'}/return.html?id=${b.id}&token=${b.return_token}"
                   style="display:block;background:#E85D00;color:#fff;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:700;font-size:.95rem;text-align:center;margin-bottom:16px;">
                  Rückgabe jetzt bestätigen →
                </a>

                <p style="color:#555;font-size:.75rem;text-align:center;margin:0;">Fragen? Erreichbar unter info@simpletrailer.de</p>
              </div>
              <p style="color:#444;font-size:.72rem;text-align:center;margin-top:24px;">SimpleTrailer · Bremen · info@simpletrailer.de</p>
            </div>
          </body></html>`
        });

        // Parallel: Push-Notification (defensiv — wenn FCM/Tokens fehlen: skipped)
        if (b.user_id) {
          await sendPushToUser(b.user_id, {
            title: '⏰ Anhaenger-Rueckgabe in 1 Stunde',
            body:  `Bitte gib deinen Anhaenger bis ${fmt(b.end_time)} Uhr zurueck — sonst 15 €/Std Verspaetungsgebuehr.`,
            channel: 'bookings',
            data: { type: 'return_reminder', booking_id: b.id },
            deep_link: `simpletrailer://return?id=${b.id}&token=${b.return_token}`
          }).catch(e => console.warn('Push fehlgeschlagen:', e.message));
        }

        await supabase.from('bookings').update({ reminder_sent: true }).eq('id', b.id);
        sent++;
      } catch (emailErr) {
        console.error('Reminder-Mail Fehler:', b.id, emailErr.message);
      }
    }

    return res.status(200).json({ checked: bookings?.length || 0, sent });
  } catch (err) {
    console.error('send-reminders:', err);
    return res.status(500).json({ error: err.message });
  }
};
