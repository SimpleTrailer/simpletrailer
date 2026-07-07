const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const crypto = require('crypto');
const { generateMietvertrag, generateRechnung } = require('./_pdf-templates');
const T = require('./_email-template');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const fmt = (d) => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { id, token } = req.query;
    if (!id || !token) return res.status(400).json({ error: 'Fehlende Parameter' });

    try {
      const { data: booking, error } = await supabase
        .from('bookings').select('*, trailers(name, late_fee_per_hour, last_lat, last_lng, last_seen_at, license_plate, appearance_photo_url)')
        .eq('id', id).eq('return_token', token).single();

      if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });

      const { stripe_payment_method_id, stripe_customer_id, return_token, ...safe } = booking;
      return res.status(200).json(safe);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { payment_intent_id } = req.body;

      const pi = await stripe.paymentIntents.retrieve(payment_intent_id, { expand: ['latest_charge'] });
      if (pi.status !== 'succeeded') {
        return res.status(400).json({ error: 'Zahlung noch nicht abgeschlossen' });
      }
      // Bereits (teil-)erstattete Zahlung darf NIE mehr eine Buchung + Schloss-Code erzeugen
      if (pi.latest_charge && (pi.latest_charge.refunded || (pi.latest_charge.amount_refunded || 0) > 0)) {
        return res.status(409).json({ error: 'Diese Zahlung wurde bereits erstattet.', refunded: true });
      }

      const { data: existing } = await supabase
        .from('bookings').select('id, access_code, return_token, precheck_token, start_time, end_time, total_amount, pickup_lat, pickup_lng')
        .eq('stripe_payment_intent_id', payment_intent_id).maybeSingle();

      if (existing) {
        const siteUrlEx = process.env.SITE_URL || 'https://www.simpletrailer.de';
        const precheckUrlEx = existing.precheck_token
          ? `${siteUrlEx}/precheck?id=${existing.id}&token=${existing.precheck_token}`
          : null;
        return res.status(200).json({
          booking_id: existing.id, already_confirmed: true,
          precheck_url: precheckUrlEx,
          return_token: existing.return_token,
          start_time: existing.start_time, end_time: existing.end_time,
          amount: existing.total_amount || 0,
          pickup_lat: existing.pickup_lat, pickup_lng: existing.pickup_lng
        });
      }

      const meta = pi.metadata;
      const amount = pi.amount / 100;

      // DOUBLE-BOOKING-SCHUTZ: Overlap-Recheck direkt vor dem Insert.
      // Der Check bei PI-Erstellung reicht nicht — zwei Kunden koennen denselben
      // Zeitraum parallel bezahlen. Der Verlierer bekommt automatisch eine
      // vollstaendige Erstattung + Info-Mail, Lion wird benachrichtigt.
      {
        const BUFFER_MS = 60 * 60 * 1000;
        const { data: clash } = await supabase
          .from('bookings').select('id, start_time, end_time, stripe_payment_intent_id')
          .eq('trailer_id', meta.trailer_id).in('status', ['confirmed', 'active']);
        const nStart = new Date(meta.start_time).getTime();
        const nEnd   = new Date(meta.end_time).getTime();
        const hasClash = (clash || []).some(b =>
          b.stripe_payment_intent_id !== payment_intent_id &&
          new Date(b.start_time).getTime() < nEnd &&
          new Date(b.end_time).getTime() + BUFFER_MS > nStart);
        if (hasClash) {
          let refunded = false;
          try {
            await stripe.refunds.create(
              { payment_intent: payment_intent_id, reason: 'requested_by_customer' },
              { idempotencyKey: `clash-refund-${payment_intent_id}` }
            );
            refunded = true;
          } catch (refErr) {
            console.error('Clash-Refund fehlgeschlagen:', payment_intent_id, refErr.message);
          }
          try { await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: meta.customer_email,
            subject: 'Deine Buchung konnte leider nicht bestätigt werden — volle Erstattung',
            text: `Hallo ${meta.customer_name},

es tut uns wirklich leid: Der Anhänger wurde für deinen Zeitraum (${fmt(meta.start_time)} – ${fmt(meta.end_time)} Uhr) in genau diesem Moment von einer anderen Person gebucht.

${refunded ? 'Deine Zahlung wurde bereits vollständig erstattet — je nach Bank dauert die Gutschrift 3–5 Werktage.' : 'Deine Zahlung wird umgehend vollständig erstattet.'}

Gern kannst du direkt einen anderen Zeitraum wählen: https://www.simpletrailer.de/booking

Sorry für die Umstände!
Lion & Samuel — SimpleTrailer`
          }); } catch (e) { console.error('Clash-Kundenmail fehlgeschlagen:', e.message); }
          try { await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            to: 'info@simpletrailer.de',
            subject: '⚠ Double-Booking abgefangen — automatisch erstattet',
            text: `PI: ${payment_intent_id}
Kunde: ${meta.customer_name} (${meta.customer_email})
Zeitraum: ${meta.start_time} – ${meta.end_time}
Trailer: ${meta.trailer_id}
Refund: ${refunded ? 'OK' : 'FEHLGESCHLAGEN — manuell in Stripe pruefen!'}`
          }); } catch (e) {}
          return res.status(409).json({
            error: 'Der Zeitraum wurde in der Zwischenzeit leider vergeben. Deine Zahlung wurde vollständig erstattet.',
            refunded: true
          });
        }
      }
      const return_token    = crypto.randomBytes(32).toString('hex');
      const precheck_token  = crypto.randomBytes(32).toString('hex');

      const insType   = meta.insurance_type   || 'none';
      const insAmount = parseFloat(meta.insurance_amount || '0') || 0;
      const freeFloating = meta.free_floating === '1';
      const cancellationProtection = meta.cancellation_protection === '1';
      const cancellationProtectionFee = parseFloat(meta.cancellation_protection_fee || '0') || 0;

      // Pickup-Position + Anhänger-Code aus trailers-Tabelle holen.
      // Code = fester Zahlenschloss-Code des Anhängers (manuell in trailers.access_code gepflegt).
      // Fallback: 6-stellig zufällig wenn kein fester Code hinterlegt (Migration noch ausstehend).
      const { data: trailerNow } = await supabase
        .from('trailers')
        .select('last_lat,last_lng,lat,lng,access_code,license_plate,appearance_photo_url')
        .eq('id', meta.trailer_id)
        .maybeSingle();
      const pickupLat = (trailerNow?.last_lat ?? trailerNow?.lat) || null;
      const pickupLng = (trailerNow?.last_lng ?? trailerNow?.lng) || null;
      const access_code = (trailerNow?.access_code && String(trailerNow.access_code).trim())
        || Math.floor(100000 + Math.random() * 900000).toString();

      const baseInsert = {
        trailer_id: meta.trailer_id, customer_name: meta.customer_name,
        customer_email: meta.customer_email, customer_phone: meta.customer_phone || null,
        start_time: meta.start_time, end_time: meta.end_time,
        pricing_type: meta.pricing_type, total_amount: amount,
        insurance_type: insType, insurance_amount: insAmount,
        customer_address: meta.customer_address || null,
        user_id: meta.user_id || null,
        stripe_payment_intent_id: payment_intent_id,
        stripe_customer_id: pi.customer, stripe_payment_method_id: pi.payment_method,
        status: 'confirmed', access_code, return_token, precheck_token,
        free_floating: freeFloating,
        cancellation_protection: cancellationProtection,
        cancellation_protection_fee: cancellationProtectionFee,
        pickup_lat: pickupLat, pickup_lng: pickupLng
      };
      // AGB-Felder optional anhaengen — wenn die DB-Spalten noch nicht existieren,
      // fallen wir auf das Insert OHNE AGB-Felder zurueck (kein Buchungs-Abbruch).
      const insertWithAgb = { ...baseInsert,
        agb_version:     meta.agb_version || null,
        agb_accepted_at: meta.agb_accepted_at || null,
        agb_accepted_ip: meta.agb_accepted_ip || null
      };

      let { data: booking, error: bookingError } = await supabase
        .from('bookings').insert(insertWithAgb).select('*, trailers(name)').single();

      if (bookingError && /column .* does not exist/i.test(bookingError.message || '')) {
        // Fallback: AGB- / Free-Floating- / Stornoschutz-Spalten fehlen in der DB -> ohne sie speichern
        console.warn('Spalte fehlt in DB, fallback auf Basis-Insert ohne neue Felder. Bitte ALTER TABLE in Supabase ausfuehren.');
        const { free_floating, pickup_lat, pickup_lng, cancellation_protection, cancellation_protection_fee, ...minimal } = baseInsert;
        ({ data: booking, error: bookingError } = await supabase
          .from('bookings').insert(minimal).select('*, trailers(name)').single());
      }

      if (bookingError && (bookingError.code === '23505' || /duplicate key/i.test(bookingError.message || ''))) {
        // Race: Webhook und Client haben gleichzeitig angelegt — die andere Seite hat gewonnen.
        const { data: won } = await supabase
          .from('bookings').select('id, access_code, return_token, precheck_token, start_time, end_time, total_amount, pickup_lat, pickup_lng')
          .eq('stripe_payment_intent_id', payment_intent_id).maybeSingle();
        if (won) {
          const siteUrlW = process.env.SITE_URL || 'https://www.simpletrailer.de';
          return res.status(200).json({
            booking_id: won.id, already_confirmed: true,
            precheck_url: won.precheck_token ? `${siteUrlW}/precheck?id=${won.id}&token=${won.precheck_token}` : null,
            return_token: won.return_token,
            start_time: won.start_time, end_time: won.end_time,
            amount: won.total_amount || 0,
            pickup_lat: won.pickup_lat, pickup_lng: won.pickup_lng
          });
        }
      }
      if (bookingError) throw bookingError;

      // Hinweis: is_available wird NICHT mehr auf false gesetzt — die Verfügbarkeit
      // wird in get-trailers.js zeitbasiert aus der bookings-Tabelle berechnet
      // (currently_booked = aktiver Buchung-Status). Der Flag trailers.is_available
      // markiert nur noch "im Service / Wartung", nicht "gerade gebucht".

      const siteUrl     = process.env.SITE_URL || 'https://www.simpletrailer.de';
      const returnUrl   = `${siteUrl}/return.html?id=${booking.id}&token=${return_token}`;
      const precheckUrl = `${siteUrl}/precheck?id=${booking.id}&token=${precheck_token}`;

      // Google-Maps-Route zum Anhaenger — wird in HTML-Mail (Button) + Plain-Text genutzt
      const routeUrl = (pickupLat && pickupLng)
        ? `https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}&travelmode=driving`
        : null;

      // Plain-Text-Fallback fuer bessere Spam-Score und Email-Clients ohne HTML
      const plainText = `Hallo ${meta.customer_name},

dein Anhänger ist reserviert.

Buchungsnummer: #${booking.id.slice(0, 8).toUpperCase()}
Anhänger: ${booking.trailers?.name || 'PKW-Anhänger'}
Kennzeichen: ${trailerNow?.license_plate || '–'}
Mietbeginn: ${fmt(meta.start_time)} Uhr
Mietende: ${fmt(meta.end_time)} Uhr
Gesamt: ${amount.toFixed(2).replace('.', ',')} € (inkl. 19 % USt)
${routeUrl ? `\nRoute zum Anhänger (Google Maps):\n${routeUrl}\n` : ''}
Schritt 1 — Vorab-Check (Foto vor Abholung):
${precheckUrl}

Schritt 2 — Rückgabe bestätigen:
${returnUrl}

Mit dem Vorab-Check-Foto wird dir der Schloss-Code freigeschaltet.

Dein Kundenbereich (alles jederzeit steuerbar — Buchung verlängern/stornieren,
Standort sehen, Mietvertrag + Rechnung herunterladen):
${siteUrl}/account

Diese Mail dient gleichzeitig als Mietvertrag und Rechnung gem. § 14 UStG.

—
SimpleTrailer GbR · Lion Grone & Samuel Obodoefuna
Waltjenstr. 96, 28237 Bremen
Steuernummer: 60/176/10854 · USt-IdNr.: DE462214434
info@simpletrailer.de · simpletrailer.de`;

      // ─── PDFs generieren (Mietvertrag + Rechnung) ─────────────
      const insLabels = { none: 'Ohne Schutzpaket', basis: 'Basis-Schutz (500 € SB)', premium: 'Premium-Schutz (50 € SB)' };
      const tariffLabels = { '3h': '3 Stunden', '6h': '6 Stunden', hours: 'Stundenmiete', day: 'Ganzer Tag', weekend: 'Wochenend-Paket (Fr–Mo)', week: '7-Tage-Paket', flexible: 'Individuell' };
      const freeFloatingFee = parseFloat(meta.free_floating_fee || '0') || 0;
      // Rabatt (optional): volle Miete + volle Add-ons werden ausgewiesen, der Rabatt als eigene
      // (negative) Position. Summe aller Positionen = tatsächlich gezahlter Betrag (amount).
      const discountAmount  = parseFloat(meta.discount_amount  || '0') || 0;
      const discountCode    = meta.discount_code || '';
      const discountPercent = parseFloat(meta.discount_percent || '0') || 0;
      const discountScope   = meta.discount_scope || 'total';
      // Volle (unrabattierte) Miete: Rabatt wieder herausrechnen, damit die Rabatt-Zeile sichtbar wird.
      const baseAmount = Math.max(0, amount - insAmount - cancellationProtectionFee - freeFloatingFee + discountAmount);
      const items = [{ label: `Anhängermiete · ${tariffLabels[meta.pricing_type] || meta.pricing_type}`, gross: baseAmount }];
      if (insAmount > 0) items.push({ label: insType === 'basis' ? 'Basis-Schutz (Selbstbeteiligung 500 €)' : 'Premium-Schutz (Selbstbeteiligung 50 €)', gross: insAmount });
      if (cancellationProtectionFee > 0) items.push({ label: 'Kostenlose Stornierung (Storno bis zum Mietbeginn)', gross: cancellationProtectionFee });
      if (freeFloatingFee > 0) items.push({ label: 'Rückgabe egal-wo in Bremen (Flexrückgabe)', gross: freeFloatingFee });
      if (discountAmount > 0) items.push({ label: `Rabatt ${discountCode}${discountScope === 'rent' ? ' (nur auf Miete)' : ''} -${discountPercent} %`, gross: -discountAmount });

      const pdfPayload = {
        bookingShort: booking.id.slice(0,8).toUpperCase(),
        contractDate: new Date().toISOString(),
        customerName:    meta.customer_name,
        customerEmail:   meta.customer_email,
        customerPhone:   meta.customer_phone,
        customerAddress: meta.customer_address,
        trailerName:     booking.trailers?.name || 'PKW-Anhänger',
        licensePlate:    trailerNow?.license_plate || '–',
        tariffLabel:     tariffLabels[meta.pricing_type] || meta.pricing_type,
        startTime:       meta.start_time,
        endTime:         meta.end_time,
        insuranceLabel:  insLabels[insType],
        cancellationLabel: cancellationProtection ? `Aktiv (${cancellationProtectionFee.toFixed(2).replace('.', ',')} €) — Storno bis zum Mietbeginn` : 'Nicht gebucht — 90 % Storno-Gebühr (AGB § 6)',
        accessCode:      access_code,
        returnModeLabel: freeFloating ? 'Bremen-Stadtgebiet (Flexrückgabe)' : 'Zurück zum Heimat-Stellplatz',
        agbVersion:      meta.agb_version || '2026-06-05',
        paymentMethod:   (pi.payment_method_types && pi.payment_method_types[0]) || 'card',
        items
      };

      let pdfMietvertrag = null, pdfRechnung = null;
      try {
        [pdfMietvertrag, pdfRechnung] = await Promise.all([
          generateMietvertrag(pdfPayload),
          generateRechnung(pdfPayload)
        ]);
      } catch (pdfErr) {
        console.error('PDF-Generierung fehlgeschlagen — Mail wird ohne Anhänge versendet:', pdfErr.message);
      }

      // Anhaenger-Foto als Inline-Attachment (cid:trailer-photo) — sonst blocken viele Mail-Clients externe Bilder.
      // Mit 4s-Timeout (AbortController), damit ein haengendes Storage-CDN nicht die ganze Buchungs-Bestaetigung blockt.
      let photoAttachment = null;
      const photoCid = 'trailer-photo';
      if (trailerNow?.appearance_photo_url) {
        const ctrl = new AbortController();
        const to   = setTimeout(() => ctrl.abort(), 4000);
        try {
          const imgRes = await fetch(trailerNow.appearance_photo_url, { signal: ctrl.signal });
          if (imgRes.ok) {
            const ct      = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
            const ext     = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg';
            const buf     = Buffer.from(await imgRes.arrayBuffer());
            photoAttachment = {
              filename:     `anhaenger.${ext}`,
              content:      buf.toString('base64'),
              content_id:   photoCid,
              disposition:  'inline',
              content_type: ct
            };
          }
        } catch (imgErr) {
          console.error('Anhaenger-Foto-Download fehlgeschlagen — Mail wird ohne Inline-Foto versendet:', imgErr.message);
        } finally {
          clearTimeout(to);
        }
      }
      const attachments = [];
      if (photoAttachment) attachments.push(photoAttachment);
      if (pdfMietvertrag)  attachments.push({ filename: `Mietvertrag-${pdfPayload.bookingShort}.pdf`, content: pdfMietvertrag });
      if (pdfRechnung)     attachments.push({ filename: `Rechnung-${pdfPayload.bookingShort}.pdf`,    content: pdfRechnung });

      try { await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: meta.customer_email,
        subject: `Mietvertrag #${booking.id.slice(0, 8).toUpperCase()} – ${booking.trailers?.name || 'Anhänger'} · ab ${new Date(meta.start_time).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })}`,
        text: plainText,
        headers: {
          'List-Unsubscribe': '<mailto:info@simpletrailer.de?subject=Abmelden>',
          'X-Entity-Ref-ID': booking.id
        },
        attachments,
        html: T.layout({
          heading: 'Mietvertrag bestätigt ✓',
          preheader: `Dein Anhänger ist reserviert — Code, Route & Vertrag im Detail.`,
          replyNote: 'Beide Links (Vorab-Check &amp; Rückgabe) bitte aufbewahren. Fragen? Antworte auf diese Mail.',
          bodyHtml:
            T.p(`Hallo ${T.esc(meta.customer_name)}, dein Anhänger ist reserviert.`) +
            `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;"><tr><td style="background:#E8F8EE;border:1px solid #BFE8CD;border-radius:12px;padding:16px 18px;">
              <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#3f7553;margin-bottom:10px;font-family:system-ui,sans-serif;">🔍 So findest du deinen Anhänger</div>
              ${photoAttachment ? `<img src="cid:${photoCid}" alt="So sieht dein Anhänger aus" width="100%" style="display:block;width:100%;max-width:400px;border-radius:8px;margin:0 auto 12px;" />` : ''}
              <table width="100%" style="font-size:14px;border-collapse:collapse;font-family:system-ui,sans-serif;">
                <tr><td style="color:#5C5953;padding:4px 0;">Kennzeichen</td><td style="text-align:right;padding:4px 0;"><strong style="color:#111213;font-family:Menlo,Consolas,monospace;letter-spacing:.5px;">${T.esc(trailerNow?.license_plate || '–')}</strong></td></tr>
                <tr><td style="color:#5C5953;padding:4px 0;">Farbe</td><td style="text-align:right;padding:4px 0;color:#4A4742;">Grau (Branding folgt)</td></tr>
              </table>
              ${routeUrl ? `<div style="margin-top:12px;"><a href="${routeUrl}" style="display:block;background:#16A34A;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;text-align:center;font-family:system-ui,sans-serif;">🧭 Route in Google Maps öffnen</a></div>` : ''}
            </td></tr></table>` +
            T.rows([
              ['Buchungsnummer', `#${booking.id.slice(0, 8).toUpperCase()}`],
              ['Anhänger', T.esc(booking.trailers?.name || 'PKW-Anhänger')],
              ['Mietdauer', T.esc(meta.pricing_type || '–')],
              ['Schutzpaket', insType === 'none' ? 'Kein Schutz' : insType === 'basis' ? 'Basis Schutz (500 € SB)' : 'Premium Schutz (50 € SB)'],
              ['Von', fmt(meta.start_time)],
              ['Bis', fmt(meta.end_time)],
              ['Bezahlt', `<span style="color:#E85D00;">${amount.toFixed(2)} €</span>`]
            ]) +
            T.callout(`<strong>Schritt 1 – Vor Abholung:</strong> Mach ein <strong>Foto des Anhängers</strong> und bestätige den Zustand – erst dann wird dir der Zugangscode für das Schloss angezeigt.`, 'green') +
            T.cta(T.btn('📷 Vorab-Check starten', precheckUrl)) +
            T.callout(`<strong>Schritt 2 – Nach der Nutzung:</strong> <a href="${returnUrl}" style="color:#E85D00;">Rückgabe bestätigen</a>`, 'grey') +
            T.callout(`<strong style="color:#7A3D00;">🎛 Dein Kundenbereich — alles jederzeit unter Kontrolle</strong><br><br>Hier kannst du jederzeit:<br>✓ Buchung verlängern oder stornieren<br>✓ Vorab-Check &amp; Rückgabe öffnen<br>✓ Mietvertrag &amp; Rechnung herunterladen<br>✓ Anhänger-Standort live in Google Maps sehen<br>✓ Zukünftige Buchungen verwalten`, 'orange') +
            T.cta(T.btn('Zum Kundenbereich', `${siteUrl}/account`)) +
            T.p('<span style="font-size:13px;color:#8A857D;display:block;text-align:center;">Login mit derselben E-Mail wie bei der Buchung.</span>') +
            T.callout('📎 Im Anhang findest du <strong>Mietvertrag</strong> und <strong>Rechnung</strong> als PDF — beide rechtssicher und druckbar.', 'grey') +
            T.p(`<span style="font-size:12px;color:#8A857D;line-height:1.55;">Mit Bezahlung wurde der Mietvertrag elektronisch geschlossen. Du hast die <a href="${siteUrl}/agb.html" style="color:#E85D00;">AGB (Stand ${meta.agb_version || '2026-06-05'})</a> und die <a href="${siteUrl}/datenschutz.html" style="color:#E85D00;">Datenschutzerklärung</a> akzeptiert. Es besteht kein Widerrufsrecht gem. § 312g Abs. 2 Nr. 9 BGB.</span>`) +
            T.callout(`<span style="font-size:12px;color:#5C5953;line-height:1.55;"><strong style="color:#34322E;">SimpleTrailer GbR</strong> · Lion Grone &amp; Samuel Obodoefuna · Waltjenstr. 96, 28237 Bremen<br>Steuernummer: 60/176/10854 (Finanzamt Bremen) · USt-IdNr.: DE462214434<br>info@simpletrailer.de · simpletrailer.de</span>`, 'grey')
        })
      }); } catch(emailErr) { console.error('E-Mail Fehler:', emailErr.message); }

      return res.status(200).json({
        booking_id: booking.id, return_token, precheck_url: precheckUrl,
        start_time: meta.start_time, end_time: meta.end_time,
        amount, trailer_name: 'PKW-Anhänger mit Plane',
        pickup_lat: booking.pickup_lat, pickup_lng: booking.pickup_lng
      });

    } catch (err) {
      console.error('booking POST:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
