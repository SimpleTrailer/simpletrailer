const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { sendPushToUser } = require('./_push-sender.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);
const T = require('./_email-template');

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
              || req.headers['x-cron-token'];
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
          html: T.layout({
            heading: '⏰ Rückgabe in ca. 1 Stunde',
            preheader: `Bitte bis ${fmt(b.end_time)} Uhr zurückgeben.`,
            replyNote: 'Fragen? Erreichbar unter info@simpletrailer.de',
            bodyHtml:
              T.p(`Hallo ${T.esc(b.customer_name)}, deine Mietzeit endet bald.`) +
              T.rows([
                ['Buchung', `#${b.id.slice(0,8).toUpperCase()}`],
                ['Rückgabe bis', `<span style="color:#E85D00;">${fmt(b.end_time)} Uhr</span>`]
              ]) +
              T.callout(`<strong>Bitte gib den Anhänger pünktlich bis ${fmt(b.end_time)} Uhr zurück.</strong><br><span style="color:#B91C1C;font-weight:600;">Bei verspäteter Rückgabe berechnen wir 15 € pro angefangene Stunde.</span>`, 'orange') +
              T.cta(T.btn('Rückgabe jetzt bestätigen →', `${process.env.SITE_URL || 'https://simpletrailer.de'}/return.html?id=${b.id}&token=${b.return_token}`))
          })
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
