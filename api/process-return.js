const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { booking_id, return_token, photo_url } = req.body;

    const { data: booking, error } = await supabase
      .from('bookings').select('*, trailers(name, late_fee_per_hour)')
      .eq('id', booking_id).eq('return_token', return_token).single();

    if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
    if (booking.status === 'returned') return res.status(400).json({ error: 'Buchung bereits abgeschlossen' });

    const now = new Date();
    const expectedEnd = new Date(booking.end_time);
    const lateMs = now - expectedEnd;
    const lateHours = Math.max(0, Math.ceil(lateMs / (1000 * 60 * 60)));
    const lateFeePerHour = booking.trailers?.late_fee_per_hour || 5;
    const lateFeeAmount = lateHours * lateFeePerHour;

    let lateFeePaymentIntentId = null;
    let lateFeeCharged = false;

    if (lateFeeAmount > 0 && booking.stripe_payment_method_id && booking.stripe_customer_id) {
      try {
        const latePi = await stripe.paymentIntents.create({
          amount: Math.round(lateFeeAmount * 100), currency: 'eur',
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          confirm: true, off_session: true,
          receipt_email: booking.customer_email,
          description: `SimpleTrailer – Verspätung ${lateHours}h`,
          metadata: { booking_id, type: 'late_fee' }
        });
        lateFeePaymentIntentId = latePi.id;
        lateFeeCharged = true;
      } catch (stripeErr) {
        console.error('Verspätungsaufpreis fehlgeschlagen:', stripeErr.message);
      }
    }

    // === RÜCKGABE-ZONE prüfen ===
    // Aktueller Tracker-Standort holen + Distanz zum Abholort + Status berechnen.
    const { data: trailerNow } = await supabase
      .from('trailers')
      .select('last_lat,last_lng,is_moving,tracker_traccar_id')
      .eq('id', booking.trailer_id)
      .maybeSingle();

    // ON-DEMAND POSITION REFRESH: Tracker-Sync läuft "nur" jede Minute — beim Rückgabe-
    // Klick holen wir noch eine FRISCHE Position direkt von Traccar, damit der Mieter
    // nicht auf einer veralteten Position basiert geblockt wird.
    let returnLat = trailerNow?.last_lat || null;
    let returnLng = trailerNow?.last_lng || null;
    if (trailerNow?.tracker_traccar_id && process.env.TRACCAR_URL && process.env.TRACCAR_USERNAME) {
      try {
        const auth = Buffer.from(`${process.env.TRACCAR_USERNAME}:${process.env.TRACCAR_PASSWORD}`).toString('base64');
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 4000); // max. 4 Sek warten
        const r = await fetch(`${process.env.TRACCAR_URL}/api/positions?deviceId=${trailerNow.tracker_traccar_id}`, {
          headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
          signal: ctrl.signal
        });
        clearTimeout(timeoutId);
        if (r.ok) {
          const positions = await r.json();
          const pos = positions[0];
          if (pos && pos.valid === true) {
            const freshLat = parseFloat(pos.latitude);
            const freshLng = parseFloat(pos.longitude);
            if (Math.abs(freshLat) > 0.0001 && Math.abs(freshLng) > 0.0001) {
              returnLat = freshLat;
              returnLng = freshLng;
              // Frische Position auch direkt in DB schreiben (für Admin-Map etc.)
              await supabase.from('trailers').update({
                last_lat: freshLat, last_lng: freshLng,
                last_seen_at: pos.fixTime || pos.deviceTime || new Date().toISOString()
              }).eq('id', booking.trailer_id);
            }
          }
        }
      } catch (refreshErr) {
        // Fail-soft: bei Timeout/Fehler nehmen wir den DB-Wert (max. 60s alt)
        console.warn('Traccar on-demand refresh fehlgeschlagen:', refreshErr.message);
      }
    }

    // Haversine-Distanz (Meter)
    function distMeters(lat1, lng1, lat2, lng2) {
      if (lat1 == null || lat2 == null) return null;
      const R = 6371000;
      const toRad = (d) => d * Math.PI / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
      return Math.round(2 * R * Math.asin(Math.sqrt(a)));
    }
    // Bremen-Polygon (Stadtgrenze, ca. 19 Punkte)
    // SYNC: identische Punkte in booking.html (BREMEN_POLYGON). Wenn hier geändert, dort auch.
    const BREMEN_POLYGON = [
      [53.218, 8.625], [53.213, 8.690], [53.193, 8.732], [53.175, 8.745],
      [53.156, 8.792], [53.145, 8.890], [53.137, 8.940], [53.108, 8.960],
      [53.075, 8.985], [53.045, 8.980], [53.025, 8.890], [53.005, 8.838],
      [52.998, 8.798], [53.008, 8.700], [53.075, 8.598], [53.110, 8.580],
      [53.137, 8.598], [53.165, 8.620], [53.187, 8.620]
    ];
    function inBremen(lat, lng) {
      if (lat == null || lng == null) return false;
      // Ray-Casting Point-in-Polygon
      let inside = false;
      for (let i = 0, j = BREMEN_POLYGON.length - 1; i < BREMEN_POLYGON.length; j = i++) {
        const [yi, xi] = BREMEN_POLYGON[i];
        const [yj, xj] = BREMEN_POLYGON[j];
        if (((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    }

    let returnDistanceM = null;
    let returnStatus = null;
    let returnExtraFee = 0;
    if (returnLat != null && booking.pickup_lat != null) {
      returnDistanceM = distMeters(booking.pickup_lat, booking.pickup_lng, returnLat, returnLng);
      const insideBremen = inBremen(returnLat, returnLng);
      // Wenn free_floating-Spalte fehlt (Buchung vor Migration), niemals Strafe abbuchen — Safe Default.
      const ffKnown = booking.free_floating === true || booking.free_floating === false;
      // Stellplatz-Radius: 500m — Tracker-Genauigkeit (~15m) + grosszuegiger Puffer,
      // damit Mieter nicht wegen Parken 1-2 Strassen entfernt eine Fee bekommen.
      if (returnDistanceM <= 500) {
        returnStatus = 'heimat';
      } else if (!insideBremen) {
        if (ffKnown) {
          returnStatus = 'outside_bremen';
          returnExtraFee = 50.00; // AGB §13.6 — Rückführungspauschale
        } else {
          console.warn('free_floating-Spalte fehlt für booking', booking_id, '— keine Strafe trotz Out-of-Bremen.');
          returnStatus = 'outside_bremen';
        }
      } else if (booking.free_floating === true) {
        returnStatus = 'free_floating_ok';
      } else if (booking.free_floating === false) {
        returnStatus = 'wrong_spot_in_bremen';
        returnExtraFee = 50.00; // AGB §13.6 — Falsch-Rückgabe-Pauschale
      } else {
        // Spalte fehlt: kein Fee, nur Status setzen für Statistik
        console.warn('free_floating-Spalte fehlt für booking', booking_id, '— behandle als heimat.');
        returnStatus = 'heimat';
      }
    }

    // Aufpreis charge (Stripe Off-Session)
    let returnExtraFeePiId = null;
    if (returnExtraFee > 0 && booking.stripe_payment_method_id && booking.stripe_customer_id) {
      try {
        const feePi = await stripe.paymentIntents.create({
          amount: Math.round(returnExtraFee * 100), currency: 'eur',
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          confirm: true, off_session: true,
          receipt_email: booking.customer_email,
          description: `SimpleTrailer – ${returnStatus === 'outside_bremen' ? 'Rückführung außerhalb Bremen' : 'Falsch-Rückgabe (nicht am Abholort)'}`,
          metadata: { booking_id, type: 'return_extra_fee', return_status: returnStatus }
        });
        returnExtraFeePiId = feePi.id;
      } catch (stripeErr) {
        console.error('Rückgabe-Aufpreis Stripe-Charge fehlgeschlagen:', stripeErr.message);
      }
    }

    const bookingUpdate = {
      status: 'returned', actual_return_time: now.toISOString(),
      return_photo_url: photo_url || null,
      late_fee_amount: lateFeeAmount,
      late_fee_payment_intent_id: lateFeePaymentIntentId,
    };
    // Neue Felder optional anhängen — DB-Fallback wenn Migration noch nicht durchgelaufen.
    const bookingUpdateWithZone = { ...bookingUpdate,
      return_lat: returnLat, return_lng: returnLng,
      return_distance_m: returnDistanceM,
      return_status: returnStatus,
      return_extra_fee: returnExtraFee,
    };
    let { error: updErr } = await supabase.from('bookings').update(bookingUpdateWithZone).eq('id', booking_id);
    if (updErr && /column .* does not exist/i.test(updErr.message || '')) {
      console.warn('Return-Zone-Spalten fehlen — fallback ohne Zone-Felder. supabase-migration-return-zones.sql ausführen.');
      await supabase.from('bookings').update(bookingUpdate).eq('id', booking_id);
    }

    // is_available wird nicht mehr verändert — der Flag markiert nur "im Service / Wartung".
    // Verfügbarkeit nach Rückgabe ergibt sich automatisch aus status='returned' der Buchung
    // (get-trailers.js berechnet currently_booked zeitbasiert).

    const total = booking.total_amount + lateFeeAmount;
    const bookingRef = booking_id.slice(0, 8).toUpperCase();

    const lateBlock = lateFeeAmount > 0
      ? `<div style="background:#1a0d00;border:1.5px solid #E85D00;border-radius:12px;padding:20px;margin-bottom:20px;">
           <p style="color:#E85D00;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px;">Verspätungsaufpreis</p>
           <p style="margin:0 0 4px;font-size:.9rem;">${lateHours} Stunde${lateHours > 1 ? 'n' : ''} × ${lateFeePerHour.toFixed(2)} € = <strong>${lateFeeAmount.toFixed(2)} €</strong></p>
           <p style="color:#888;font-size:.78rem;margin:0;">${lateFeeCharged ? '✓ Automatisch abgebucht.' : '⚠ Automatische Abbuchung fehlgeschlagen. Wir melden uns.'}</p>
         </div>`
      : `<div style="background:#0a1f0a;border:1.5px solid #22c55e;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
           <p style="color:#4ade80;font-weight:700;margin:0;">✓ Pünktlich zurückgegeben – danke!</p>
         </div>`;

    // Review-CTA: nur wenn pünktlich zurückgegeben (positive Erfahrung)
    const reviewBlock = lateFeeAmount > 0 ? '' : `
      <div style="background:#1A1A1A;border:1px solid #383838;border-radius:12px;padding:24px 20px;margin-top:24px;text-align:center;">
        <div style="font-size:1.4rem;margin-bottom:6px;">⭐⭐⭐⭐⭐</div>
        <p style="font-weight:700;font-size:.95rem;margin:0 0 6px;">Wie war deine Erfahrung?</p>
        <p style="color:#888;font-size:.82rem;margin:0 0 16px;line-height:1.5;">Eine kurze Google-Bewertung hilft uns, weiter zu wachsen — und anderen, uns zu finden.</p>
        <a href="https://g.page/r/Cd6jwKdwS_Y7EAE/review" target="_blank"
           style="display:inline-block;background:#E85D00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:.88rem;">
          Auf Google bewerten →
        </a>
      </div>`;

    await resend.emails.send({
      from: 'SimpleTrailer <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: booking.customer_email,
      subject: `Rückgabe bestätigt #${bookingRef} – SimpleTrailer`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
        <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
          <div style="text-align:center;margin-bottom:32px;">
            <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
          </div>
          <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;">
            <h1 style="margin:0 0 8px;font-size:1.4rem;">Rückgabe bestätigt</h1>
            <p style="color:#888;margin:0 0 24px;">Hallo ${booking.customer_name}, hier deine Abrechnung.</p>
            ${lateBlock}
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Buchung</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">#${bookingRef}</td></tr>
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Mietbetrag</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${booking.total_amount.toFixed(2)} €</td></tr>
              ${lateFeeAmount > 0 ? `<tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Verspätung</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;color:#E85D00;font-size:.88rem;">+ ${lateFeeAmount.toFixed(2)} €</td></tr>` : ''}
              <tr><td style="color:#888;padding:9px 0;font-size:.88rem;font-weight:700;">Gesamt</td><td style="text-align:right;padding:9px 0;font-weight:800;font-size:1.05rem;">${total.toFixed(2)} €</td></tr>
            </table>
            ${reviewBlock}
          </div>
          <p style="color:#444;font-size:.72rem;text-align:center;margin-top:24px;">SimpleTrailer · Bremen · info@simpletrailer.de</p>
        </div>
      </body></html>`
    });

    return res.status(200).json({
      success: true, late_hours: lateHours,
      late_fee: lateFeeAmount, late_fee_charged: lateFeeCharged, total
    });

  } catch (err) {
    console.error('process-return:', err);
    return res.status(500).json({ error: err.message });
  }
};
