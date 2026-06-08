const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const crypto = require('crypto');
const { generateMietvertrag, generateRechnung } = require('./_pdf-templates');

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
        .from('bookings').select('*, trailers(name, late_fee_per_hour, last_lat, last_lng, last_seen_at)')
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

      const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (pi.status !== 'succeeded') {
        return res.status(400).json({ error: 'Zahlung noch nicht abgeschlossen' });
      }

      const { data: existing } = await supabase
        .from('bookings').select('id, access_code, return_token, precheck_token')
        .eq('stripe_payment_intent_id', payment_intent_id).maybeSingle();

      if (existing) {
        const siteUrlEx = process.env.SITE_URL || 'https://simpletrailer.de';
        const precheckUrlEx = existing.precheck_token
          ? `${siteUrlEx}/precheck?id=${existing.id}&token=${existing.precheck_token}`
          : null;
        return res.status(200).json({
          booking_id: existing.id, already_confirmed: true,
          precheck_url: precheckUrlEx,
          return_token: existing.return_token,
          start_time: null, end_time: null, amount: 0
        });
      }

      const meta = pi.metadata;
      const amount = pi.amount / 100;
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
        .select('last_lat,last_lng,lat,lng,access_code,license_plate')
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

      if (bookingError) throw bookingError;

      // Hinweis: is_available wird NICHT mehr auf false gesetzt — die Verfügbarkeit
      // wird in get-trailers.js zeitbasiert aus der bookings-Tabelle berechnet
      // (currently_booked = aktiver Buchung-Status). Der Flag trailers.is_available
      // markiert nur noch "im Service / Wartung", nicht "gerade gebucht".

      const siteUrl     = process.env.SITE_URL || 'https://simpletrailer.de';
      const returnUrl   = `${siteUrl}/return.html?id=${booking.id}&token=${return_token}`;
      const precheckUrl = `${siteUrl}/precheck?id=${booking.id}&token=${precheck_token}`;

      // Plain-Text-Fallback fuer bessere Spam-Score und Email-Clients ohne HTML
      const plainText = `Hallo ${meta.customer_name},

dein Anhänger ist reserviert.

Buchungsnummer: #${booking.id.slice(0, 8).toUpperCase()}
Anhänger: ${booking.trailers?.name || 'PKW-Anhänger'}
Mietbeginn: ${fmt(meta.start_time)} Uhr
Mietende: ${fmt(meta.end_time)} Uhr
Gesamt: ${amount.toFixed(2).replace('.', ',')} € (inkl. 19 % USt)

Schritt 1 — Vorab-Check (Foto vor Abholung):
${precheckUrl}

Schritt 2 — Rückgabe bestätigen:
${returnUrl}

Mit dem Vorab-Check-Foto wird dir der Schloss-Code freigeschaltet.
Alle Details findest du in deinem Kundenbereich: ${siteUrl}/account

Diese Mail dient gleichzeitig als Mietvertrag und Rechnung gem. § 14 UStG.

—
SimpleTrailer GbR · Lion Grone & Samuel Obodoefuna
Waltjenstr. 96, 28237 Bremen
Steuernummer: 60/176/10854 · USt-IdNr.: DE462214434
info@simpletrailer.de · simpletrailer.de`;

      // ─── PDFs generieren (Mietvertrag + Rechnung) ─────────────
      const insLabels = { none: 'Ohne Schutzpaket', basis: 'Basis-Schutz (500 € SB)', premium: 'Premium-Schutz (50 € SB)' };
      const tariffLabels = { '3h': '3 Stunden', '6h': '6 Stunden', day: 'Ganzer Tag', weekend: 'Wochenende (Fr-So)', week: '1 Woche', flexible: 'Individuell' };
      const freeFloatingFee = parseFloat(meta.free_floating_fee || '0') || 0;
      const baseAmount = Math.max(0, amount - insAmount - cancellationProtectionFee - freeFloatingFee);
      const items = [{ label: `Anhängermiete · ${tariffLabels[meta.pricing_type] || meta.pricing_type}`, gross: baseAmount }];
      if (insAmount > 0) items.push({ label: insType === 'basis' ? 'Basis-Schutz (Selbstbeteiligung 500 €)' : 'Premium-Schutz (Selbstbeteiligung 50 €)', gross: insAmount });
      if (cancellationProtectionFee > 0) items.push({ label: 'Kostenlose Stornierung (Storno bis 30 Min vor Mietbeginn)', gross: cancellationProtectionFee });
      if (freeFloatingFee > 0) items.push({ label: 'Rückgabe egal-wo in Bremen (Flexrückgabe)', gross: freeFloatingFee });

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
        cancellationLabel: cancellationProtection ? `Aktiv (${cancellationProtectionFee.toFixed(2).replace('.', ',')} €) — Storno bis 30 Min vor Mietbeginn` : 'Nicht gebucht — 90 % Storno-Gebühr (AGB § 6)',
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

      const attachments = [];
      if (pdfMietvertrag) attachments.push({ filename: `Mietvertrag-${pdfPayload.bookingShort}.pdf`, content: pdfMietvertrag });
      if (pdfRechnung)    attachments.push({ filename: `Rechnung-${pdfPayload.bookingShort}.pdf`,    content: pdfRechnung });

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
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
          <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
            </div>
            <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;">
              <h1 style="margin:0 0 8px;font-size:1.4rem;">Mietvertrag bestätigt</h1>
              <p style="color:#888;margin:0 0 28px;">Hallo ${meta.customer_name}, dein Anhänger ist reserviert.</p>
              <div style="background:#111;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
                <p style="color:#E85D00;font-size:0.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px;">Buchungsnummer</p>
                <p style="font-weight:800;font-size:1.1rem;margin:0;">#${booking.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Anhänger</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${booking.trailers?.name || 'PKW-Anhänger'}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Mietdauer</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${meta.pricing_type || '–'}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Schutzpaket</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${insType === 'none' ? 'Kein Schutz' : insType === 'basis' ? 'Basis Schutz (500 € SB)' : 'Premium Schutz (50 € SB)'}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Von</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${fmt(meta.start_time)}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Bis</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${fmt(meta.end_time)}</td></tr>
                <tr><td style="color:#888;padding:9px 0;font-size:.88rem;">Bezahlt</td><td style="text-align:right;padding:9px 0;color:#E85D00;font-weight:700;font-size:1rem;">${amount.toFixed(2)} €</td></tr>
              </table>
              <div style="background:#0a1f0a;border:1.5px solid #22c55e;border-radius:12px;padding:20px;margin-bottom:20px;">
                <p style="color:#4ade80;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;">Schritt 1 – Vor Abholung</p>
                <p style="margin:0 0 12px;font-size:.9rem;">Mache ein <strong>Foto des Anhängers</strong> und bestätige den Zustand – erst dann wird dir der Zugangscode für das Schloss angezeigt.</p>
                <a href="${precheckUrl}" style="display:inline-block;background:#22c55e;color:#000;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:.9rem;">📷 Vorab-Check starten →</a>
              </div>
              <div style="background:#1a1a1a;border:1px solid #383838;border-radius:12px;padding:16px 20px;margin-bottom:20px;text-align:center;">
                <p style="color:#888;font-size:.78rem;margin:0 0 4px;">Schritt 2 – Nach der Nutzung</p>
                <a href="${returnUrl}" style="color:#E85D00;font-size:.85rem;font-weight:600;text-decoration:none;">Rückgabe bestätigen →</a>
              </div>
              <div style="background:#111;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
                <p style="color:#888;font-size:.78rem;margin:0 0 6px;">Alle Infos auf einen Blick:</p>
                <p style="font-size:.85rem;margin:0;">Buchungsdetails, Schutzpaket, Vorab-Check und Rückgabe findest du jederzeit in deinem <a href="${siteUrl}/account" style="color:#E85D00;text-decoration:none;font-weight:600;">Kundenbereich →</a></p>
              </div>
              <p style="color:#555;font-size:.75rem;text-align:center;margin:0;">Beide Links bitte aufbewahren.</p>

              <div style="background:#0a0a0a;border:1px solid #383838;border-radius:10px;padding:14px 18px;margin-top:18px;">
                <p style="color:#E85D00;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;">📎 Anhänge zu dieser Buchung</p>
                <p style="font-size:.85rem;color:#ccc;margin:0;line-height:1.55;">
                  Im Anhang findest du <strong style="color:#fff;">Mietvertrag</strong> und <strong style="color:#fff;">Rechnung</strong> als PDF — beide rechtssicher und druckbar.
                </p>
              </div>

              <p style="color:#666;font-size:.72rem;margin:14px 0 0;line-height:1.55;text-align:center;">
                Mit Bezahlung wurde der Mietvertrag elektronisch geschlossen. Du hast die <a href="${siteUrl}/agb.html" style="color:#E85D00;text-decoration:none;">AGB (Stand ${meta.agb_version || '2026-06-05'})</a> und die <a href="${siteUrl}/datenschutz.html" style="color:#E85D00;text-decoration:none;">Datenschutzerklärung</a> akzeptiert.<br>
                Es besteht kein Widerrufsrecht gem. § 312g Abs. 2 Nr. 9 BGB.
              </p>
            </div>

            <div style="margin-top:24px;padding:14px 18px;background:#0a0a0a;border-radius:8px;border:1px solid #1f1f1f;color:#888;font-size:.72rem;font-family:Arial,sans-serif;line-height:1.55;text-align:center;">
              <strong style="color:#bbb;">SimpleTrailer GbR</strong> · Lion Grone &amp; Samuel Obodoefuna · Waltjenstr. 96, 28237 Bremen<br>
              Steuernummer: 60/176/10854 (Finanzamt Bremen) · USt-IdNr.: DE462214434<br>
              info@simpletrailer.de · simpletrailer.de
            </div>
          </div>
        </body></html>`
      }); } catch(emailErr) { console.error('E-Mail Fehler:', emailErr.message); }

      return res.status(200).json({
        booking_id: booking.id, return_token, precheck_url: precheckUrl,
        start_time: meta.start_time, end_time: meta.end_time,
        amount, trailer_name: 'PKW-Anhänger mit Plane'
      });

    } catch (err) {
      console.error('booking POST:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
