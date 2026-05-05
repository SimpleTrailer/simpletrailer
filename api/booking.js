const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const crypto = require('crypto');

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
        .from('bookings').select('*, trailers(name, late_fee_per_hour)')
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
      const access_code     = Math.floor(100000 + Math.random() * 900000).toString();

      const insType   = meta.insurance_type   || 'none';
      const insAmount = parseFloat(meta.insurance_amount || '0') || 0;

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
        status: 'confirmed', access_code, return_token, precheck_token
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
        // Fallback: AGB-Spalten fehlen in der DB -> ohne sie speichern
        console.warn('AGB-Spalten fehlen in DB, fallback auf Basis-Insert. Bitte ALTER TABLE in Supabase ausfuehren.');
        ({ data: booking, error: bookingError } = await supabase
          .from('bookings').insert(baseInsert).select('*, trailers(name)').single());
      }

      if (bookingError) throw bookingError;

      await supabase.from('trailers').update({ is_available: false }).eq('id', meta.trailer_id);

      const siteUrl     = process.env.SITE_URL || 'https://simpletrailer.de';
      const returnUrl   = `${siteUrl}/return.html?id=${booking.id}&token=${return_token}`;
      const precheckUrl = `${siteUrl}/precheck?id=${booking.id}&token=${precheck_token}`;

      try { await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: meta.customer_email,
        subject: `✅ Buchung bestätigt #${booking.id.slice(0, 8).toUpperCase()} – SimpleTrailer`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
          <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
            </div>
            <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;">
              <h1 style="margin:0 0 8px;font-size:1.4rem;">Buchung bestätigt! 🎉</h1>
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
            </div>

            <!-- ===== MIETVERTRAG (rechtssichere Beweisdokumentation) ===== -->
            <div style="background:#fff;color:#222;border-radius:16px;padding:32px;margin-top:24px;font-family:Georgia,serif;">
              <div style="text-align:center;border-bottom:2px solid #E85D00;padding-bottom:16px;margin-bottom:20px;">
                <p style="font-family:Arial,sans-serif;font-size:.65rem;letter-spacing:.15em;color:#888;text-transform:uppercase;margin:0 0 4px;">Mietvertrag</p>
                <h2 style="margin:0;color:#0D0D0D;font-size:1.4rem;">SimpleTrailer GbR</h2>
                <p style="margin:4px 0 0;color:#666;font-size:.8rem;font-family:Arial,sans-serif;">Vertrag-Nr.: <strong>#${booking.id.slice(0, 8).toUpperCase()}</strong> · ausgestellt ${fmt(new Date())} Uhr</p>
              </div>

              <h3 style="font-size:.95rem;color:#0D0D0D;margin:20px 0 8px;font-family:Arial,sans-serif;">Vertragsparteien</h3>
              <p style="font-size:.85rem;line-height:1.6;margin:0 0 16px;font-family:Arial,sans-serif;">
                <strong>Vermieter:</strong> SimpleTrailer GbR, vertreten durch Lion Grone und Samuel Obodoefuna, Waltjenstr. 96, 28237 Bremen, info@simpletrailer.de<br><br>
                <strong>Mieter:</strong> ${meta.customer_name}<br>
                ${meta.customer_address ? `Anschrift: ${meta.customer_address}<br>` : ''}
                E-Mail: ${meta.customer_email}<br>
                ${meta.customer_phone ? `Telefon: ${meta.customer_phone}` : ''}
              </p>

              <h3 style="font-size:.95rem;color:#0D0D0D;margin:20px 0 8px;font-family:Arial,sans-serif;">Mietgegenstand</h3>
              <table style="width:100%;font-size:.85rem;font-family:Arial,sans-serif;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#666;width:40%;">Anhänger</td><td style="padding:6px 0;font-weight:600;">${booking.trailers?.name || 'PKW-Anhänger'}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Tarif</td><td style="padding:6px 0;font-weight:600;">${meta.pricing_type || '–'}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Mietbeginn</td><td style="padding:6px 0;font-weight:600;">${fmt(meta.start_time)} Uhr</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Mietende</td><td style="padding:6px 0;font-weight:600;">${fmt(meta.end_time)} Uhr</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Schutzpaket</td><td style="padding:6px 0;font-weight:600;">${insType === 'none' ? 'Keine Versicherung – volle Mieterhaftung' : insType === 'basis' ? 'Basis-Schutz · 500 € Selbstbeteiligung' : 'Premium-Schutz · 50 € Selbstbeteiligung'}</td></tr>
              </table>

              <h3 style="font-size:.95rem;color:#0D0D0D;margin:20px 0 8px;font-family:Arial,sans-serif;">Vergütung & Umsatzsteuer</h3>
              <table style="width:100%;font-size:.85rem;font-family:Arial,sans-serif;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#666;width:60%;">Mietpreis netto (inkl. ggf. Schutzpaket)</td><td style="padding:6px 0;text-align:right;font-weight:600;">${(amount / 1.19).toFixed(2).replace('.',',')} €</td></tr>
                <tr><td style="padding:6px 0;color:#666;">zzgl. 19 % Umsatzsteuer</td><td style="padding:6px 0;text-align:right;font-weight:600;">${(amount - amount / 1.19).toFixed(2).replace('.',',')} €</td></tr>
                <tr style="border-top:2px solid #ddd;"><td style="padding:8px 0 6px;color:#0D0D0D;font-weight:700;">Gesamtbetrag (brutto, gezahlt)</td><td style="padding:8px 0 6px;text-align:right;font-weight:700;color:#0D0D0D;">${amount.toFixed(2).replace('.',',')} €</td></tr>
                <tr><td style="padding:14px 0 6px;color:#666;font-size:.78rem;" colspan="2"><em>Diese Buchungsbestätigung dient zugleich als Rechnung gemäß § 14 UStG.</em></td></tr>
                <tr><td style="padding:6px 0;color:#666;">Verspätungsgebühr (bei verspäteter Rückgabe)</td><td style="padding:6px 0;text-align:right;">15,00 € / angefangene Stunde</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Reinigungspauschale bei nicht ordnungsgemäßer Rückgabe</td><td style="padding:6px 0;text-align:right;">30,00 €</td></tr>
              </table>

              <h3 style="font-size:.95rem;color:#0D0D0D;margin:20px 0 8px;font-family:Arial,sans-serif;">Wesentliche Pflichten des Mieters</h3>
              <ul style="font-size:.82rem;line-height:1.6;font-family:Arial,sans-serif;padding-left:20px;margin:0;color:#333;">
                <li>Pre-Check-Foto vor Abholung anfertigen</li>
                <li>Anhänger nur im zulässigen Gesamtgewicht und der zugelassenen Fahrerlaubnisklasse nutzen</li>
                <li>Keine Auslandsfahrten ohne vorherige schriftliche Zustimmung</li>
                <li>Schäden unverzüglich (innerhalb 2h) per E-Mail melden</li>
                <li>Pünktliche und gereinigte Rückgabe</li>
              </ul>

              <h3 style="font-size:.95rem;color:#0D0D0D;margin:20px 0 8px;font-family:Arial,sans-serif;">Einzugsermächtigung</h3>
              <p style="font-size:.82rem;line-height:1.6;font-family:Arial,sans-serif;margin:0;color:#333;">
                Der Mieter ermächtigt den Vermieter, etwaige Verspätungs-, Reinigungs- und Schadensgebühren automatisch über die bei der Buchung hinterlegte Zahlungsmethode (über Stripe Payments Europe Ltd.) einzuziehen.
              </p>

              <div style="background:#f9f9f9;border-left:3px solid #E85D00;padding:14px 18px;margin:24px 0 16px;font-family:Arial,sans-serif;">
                <p style="font-size:.78rem;color:#666;margin:0 0 4px;line-height:1.5;">
                  Es gelten die <a href="${siteUrl}/agb.html" style="color:#E85D00;text-decoration:none;font-weight:600;">vollständigen AGB</a> in der zum Buchungszeitpunkt gültigen Fassung. Diese hat der Mieter elektronisch akzeptiert.
                </p>
              </div>

              <p style="font-size:.7rem;color:#999;font-family:Arial,sans-serif;margin:20px 0 0;text-align:center;line-height:1.5;">
                Diese E-Mail ersetzt einen unterzeichneten Vertrag.<br>
                Erstellt am ${fmt(new Date())} Uhr · SimpleTrailer GbR · Bremen
              </p>
            </div>

            <p style="color:#444;font-size:.72rem;text-align:center;margin-top:24px;">SimpleTrailer · Bremen · info@simpletrailer.de</p>
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
