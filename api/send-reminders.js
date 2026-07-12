const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { sendPushToUser } = require('./_push-sender.js');
const { pushLion } = require('./_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);
const T = require('./_email-template');

const fmt = (d) => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

// Distanz in Metern (Haversine) — für den GPS-Guard des No-Show-Auto-Abschlusses
const distMeters = (la1, lo1, la2, lo2) => {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((la2 - la1) * r / 2) ** 2
          + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

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
              T.callout(`<strong>Bitte gib den Anhänger pünktlich bis ${fmt(b.end_time)} Uhr zurück.</strong><br><span style="color:#B91C1C;font-weight:600;">Bei verspäteter Rückgabe berechnen wir 10 € pro angefangene Stunde.</span>`, 'orange') +
              T.cta(T.btn('Rückgabe jetzt bestätigen →', `${process.env.SITE_URL || 'https://simpletrailer.de'}/return.html?id=${b.id}&token=${b.return_token}`))
          })
        });

        // Parallel: Push-Notification (defensiv — wenn FCM/Tokens fehlen: skipped)
        if (b.user_id) {
          await sendPushToUser(b.user_id, {
            title: '⏰ Anhaenger-Rueckgabe in 1 Stunde',
            body:  `Bitte gib deinen Anhaenger bis ${fmt(b.end_time)} Uhr zurueck — sonst 10 €/Std Verspaetungsgebuehr.`,
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

    // ---- Abhol-Erinnerung: Mietzeit hat begonnen, aber kein Precheck (= vermutlich nicht abgeholt) ----
    // Braucht die Spalte bookings.pickup_reminder_sent (BOOLEAN DEFAULT FALSE).
    // Eigener try/catch: Wenn die Spalte (noch) fehlt, läuft die Rückgabe-Erinnerung oben trotzdem normal.
    let pickupSent = 0;
    try {
      const graceCutoff = new Date(now.getTime() - 15 * 60 * 1000);      // 15 Min Karenz nach Mietbeginn
      const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);  // nicht älter als 2h (schützt Alt-Buchungen beim ersten Deploy)

      const { data: notPickedUp, error: puError } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'confirmed')
        .eq('pickup_reminder_sent', false)
        .lte('start_time', graceCutoff.toISOString())
        .gte('start_time', windowStart.toISOString())
        .gte('end_time', now.toISOString());

      if (puError) throw puError;

      for (const b of notPickedUp || []) {
        try {
          // Flag ZUERST atomisch beanspruchen (at-most-once): Bei dieser Höflichkeits-Mail
          // ist "im Zweifel verloren" besser als "im Zweifel doppelt" (Timeout nach Send).
          const { data: claimed, error: claimErr } = await supabase
            .from('bookings')
            .update({ pickup_reminder_sent: true })
            .eq('id', b.id)
            .eq('pickup_reminder_sent', false)
            .select('id');
          if (claimErr || !claimed || claimed.length === 0) continue;

          const precheckUrl = `${process.env.SITE_URL || 'https://simpletrailer.de'}/precheck?id=${b.id}&token=${b.precheck_token}`;

          await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: b.customer_email,
            subject: `🚚 Deine Mietzeit läuft – dein Anhänger wartet auf dich`,
            html: T.layout({
              heading: '🚚 Deine Mietzeit hat begonnen',
              preheader: `Dein Anhänger steht seit ${fmt(b.start_time)} Uhr für dich bereit.`,
              replyNote: 'Du schaffst es nicht oder hast Fragen? Antworte einfach auf diese Mail oder ruf uns an: 0157 5425 5876.',
              bodyHtml:
                T.p(`Hallo ${T.esc(b.customer_name)}, deine Mietzeit hat um ${fmt(b.start_time)} Uhr begonnen — dein Anhänger steht für dich bereit.`) +
                T.rows([
                  ['Buchung', `#${b.id.slice(0,8).toUpperCase()}`],
                  ['Mietzeit', `${fmt(b.start_time)} – ${fmt(b.end_time)} Uhr`]
                ]) +
                T.callout(`<strong>Schon abgeholt?</strong> Dann kannst du diese Mail einfach ignorieren.<br>Falls nicht: Mach vor der Abholung kurz den Foto-Check — direkt danach bekommst du den Zugangscode für das Schloss.`, 'orange') +
                T.cta(T.btn('Zum Foto-Check & Abholung →', precheckUrl))
            })
          });

          // Parallel: Push-Notification (defensiv — wenn FCM/Tokens fehlen: skipped)
          if (b.user_id) {
            await sendPushToUser(b.user_id, {
              title: '🚚 Dein Anhaenger wartet auf dich',
              body:  `Deine Mietzeit hat um ${fmt(b.start_time)} Uhr begonnen. Mach den Foto-Check und hol deinen Anhaenger ab.`,
              channel: 'bookings',
              data: { type: 'pickup_reminder', booking_id: b.id },
              deep_link: `simpletrailer://precheck?id=${b.id}&token=${b.precheck_token}`
            }).catch(e => console.warn('Push fehlgeschlagen:', e.message));
          }

          pickupSent++;
        } catch (emailErr) {
          console.error('Abhol-Erinnerung Fehler:', b.id, emailErr.message);
        }
      }
    } catch (pickupErr) {
      console.warn('Abhol-Erinnerung übersprungen:', pickupErr.message);
    }

    // ---- Auto-Abschluss No-Show: Mietzeit >1h vorbei, nie abgeholt (kein Precheck → Status blieb 'confirmed') ----
    // Buchung wird als abgeschlossen markiert (status 'returned' + no_show), Kunde bekommt
    // "Buchung beendet"-Mail, Lion einen Alert (Kulanz-/Refund-Entscheidung bleibt bei ihm).
    // Braucht die Spalte bookings.no_show (BOOLEAN DEFAULT FALSE). Eigener try/catch wie oben.
    let autoCompleted = 0;
    try {
      const oneHourAgo   = new Date(now.getTime() - 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000); // Alt-Buchungen beim ersten Deploy schützen

      const { data: noShows, error: nsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'confirmed')
        .lte('end_time', oneHourAgo.toISOString())
        .gte('end_time', threeDaysAgo.toISOString());
      if (nsError) throw nsError;

      for (const b of noShows || []) {
        try {
          // GPS-GUARD: Der Schloss-Code steht im Mietvertrag-PDF der Bestätigungsmail —
          // Abholung OHNE Precheck ist also möglich (Status bliebe dann auch 'confirmed').
          // Nur auto-abschließen, wenn der Anhänger nachweislich (frisches GPS-Signal <8h)
          // noch an der Abhol-Position steht. Sonst: Buchung bleibt offen — das
          // Sicherheitsnetz in anomaly-check (2b) meldet den Fall alle 6h an Lion.
          const { data: tr } = await supabase.from('trailers')
            .select('last_lat, last_lng, last_seen_at')
            .eq('id', b.trailer_id).maybeSingle();
          const trackerFresh = !!(tr && tr.last_seen_at && (now.getTime() - new Date(tr.last_seen_at).getTime()) < 8 * 3600000);
          const hasCoords = !!(tr && tr.last_lat != null && tr.last_lng != null && b.pickup_lat != null && b.pickup_lng != null);
          const stillAtPickup = trackerFresh && hasCoords
            && distMeters(tr.last_lat, tr.last_lng, b.pickup_lat, b.pickup_lng) <= 150;
          if (!stillAtPickup) {
            console.warn('Auto-Abschluss übersprungen (GPS bestätigt Standort nicht):', b.id);
            continue;
          }

          // Claim-first & atomisch (Status-Guard): nur EIN Cron-Lauf gewinnt, dann erst Mails.
          const { data: claimed, error: claimErr } = await supabase
            .from('bookings')
            .update({ status: 'returned', no_show: true })
            .eq('id', b.id)
            .eq('status', 'confirmed')
            .select('id');
          if (claimErr || !claimed || claimed.length === 0) continue;

          // Lion ZUERST informieren — so ist der Abschluss auch bei Kunden-Mail-Fehler nie still.
          await pushLion({
            severity: 'yellow',
            category: 'alert',
            title: `No-Show automatisch abgeschlossen: ${T.esc(b.customer_name)}`,
            htmlBody: `
              <p>Mietzeit abgelaufen, Anhänger wurde nie abgeholt (kein Precheck). Die Buchung wurde automatisch abgeschlossen, der Kunde bekommt eine "Buchung beendet"-Mail.</p>
              <table style="width:100%;font-size:.92rem;line-height:1.6;">
                <tr><td style="color:#888;width:35%;">Mieter</td><td><strong>${T.esc(b.customer_name)}</strong></td></tr>
                <tr><td style="color:#888;">Email</td><td>${T.esc(b.customer_email)}</td></tr>
                <tr><td style="color:#888;">Mietzeitraum</td><td>${fmt(b.start_time)} – ${fmt(b.end_time)} Uhr</td></tr>
                <tr><td style="color:#888;">Betrag (bezahlt)</td><td>${(b.total_amount || 0).toFixed(2).replace('.', ',')} €</td></tr>
                <tr><td style="color:#888;">Buchungs-ID</td><td><code>#${b.id.slice(0,8).toUpperCase()}</code></td></tr>
                <tr><td style="color:#888;">GPS-Check</td><td>✓ Anhänger steht an der Abhol-Position</td></tr>
              </table>
              <p style="color:#888;font-size:.85rem;">Kulanz-Erstattung? Im Admin: "Stornieren &amp; erstatten" oder Kulanz-Mail.</p>
            `,
            link: 'https://simpletrailer.de/admin',
          }).catch(e => console.warn('Lion-Alert fehlgeschlagen:', e.message));

          await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: b.customer_email,
            subject: `Deine Buchung ist beendet – SimpleTrailer`,
            html: T.layout({
              heading: 'Deine Buchung ist beendet',
              preheader: `Dein Mietzeitraum ist abgelaufen — wir haben deine Buchung abgeschlossen.`,
              replyNote: 'Fragen dazu? Antworte einfach auf diese Mail oder ruf uns an: 0157 5425 5876.',
              bodyHtml:
                T.p(`Hallo ${T.esc(b.customer_name)}, dein gebuchter Mietzeitraum ist abgelaufen und wir haben deine Buchung abgeschlossen.`) +
                T.rows([
                  ['Buchung', `#${b.id.slice(0,8).toUpperCase()}`],
                  ['Mietzeitraum', `${fmt(b.start_time)} – ${fmt(b.end_time)} Uhr`]
                ]) +
                T.p(`Da wir keine Abholung registriert haben, musst du nichts weiter tun — es kommen auch keine zusätzlichen Gebühren auf dich zu.`) +
                T.callout(`Ist etwas dazwischengekommen? Antworte einfach kurz auf diese Mail — wir schauen uns das gerne an.`, 'orange')
            })
          });

          autoCompleted++;
        } catch (nsItemErr) {
          console.error('Auto-Abschluss Fehler:', b.id, nsItemErr.message);
        }
      }
    } catch (nsErr) {
      console.warn('Auto-Abschluss übersprungen:', nsErr.message);
    }

    return res.status(200).json({ checked: bookings?.length || 0, sent, pickup_sent: pickupSent, auto_completed: autoCompleted });
  } catch (err) {
    console.error('send-reminders:', err);
    return res.status(500).json({ error: err.message });
  }
};
