const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const T = require('./_email-template');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const {
      booking_id, return_token, photo_url, ladeflaeche_photo_url,
      mieter_confirmed_in_zone, mieter_geo_lat, mieter_geo_lng
    } = req.body;

    const { data: booking, error } = await supabase
      .from('bookings').select('*, trailers(name, late_fee_per_hour)')
      .eq('id', booking_id).eq('return_token', return_token).single();

    if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
    if (booking.status === 'returned') return res.status(400).json({ error: 'Buchung bereits abgeschlossen' });
    if (booking.status === 'pending_position_check') return res.status(400).json({ error: 'Rueckgabe bereits vermerkt — Bestaetigung folgt sobald Tracker sich meldet' });

    const now = new Date();
    const expectedEnd = new Date(booking.end_time);
    const lateMs = now - expectedEnd;
    const GRACE_MS = 3 * 60 * 1000; // 3 Min Kulanz — erst danach zählt die Verspätung
    const lateHours = lateMs <= GRACE_MS ? 0 : Math.ceil(lateMs / (1000 * 60 * 60));
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
        // Markieren als offene Forderung (queryable im Admin) + SOFORT Lion alarmieren.
        lateFeePaymentIntentId = 'FAILED:offsession';
        try {
          await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: 'info@simpletrailer.de',
            subject: `⚠ OFFENE FORDERUNG: ${lateFeeAmount.toFixed(2)} € Verspätung NICHT eingezogen — #${booking_id.slice(0,8).toUpperCase()}`,
            text: `Die automatische Abbuchung der Verspätungsgebühr ist FEHLGESCHLAGEN — bitte manuell einziehen.\n\nKunde:   ${booking.customer_name} (${booking.customer_email})\nBuchung: #${booking_id.slice(0,8).toUpperCase()}\nBetrag:  ${lateFeeAmount.toFixed(2)} € (${lateHours}h Verspätung)\nGrund:   ${stripeErr.code || stripeErr.decline_code || stripeErr.message}\n\nEinziehen: Stripe → Payment Links → ${lateFeeAmount.toFixed(2)} € → an ${booking.customer_email} senden.`
          });
        } catch (e) { console.error('Alarm-Mail (late_fee) fehlgeschlagen:', e.message); }
      }
    }

    // === RÜCKGABE-ZONE prüfen ===
    // Aktueller Tracker-Standort holen + Distanz zum Abholort + Status berechnen.
    const { data: trailerNow } = await supabase
      .from('trailers')
      .select('last_lat,last_lng,last_seen_at,is_moving,tracker_traccar_id')
      .eq('id', booking.trailer_id)
      .maybeSingle();

    // Wenn Traccar nicht antwortet, ermitteln wir Frische aus der DB-Spalte
    if (trailerNow?.last_seen_at) {
      const dbAge = (Date.now() - new Date(trailerNow.last_seen_at).getTime()) / 60000;
      // Nur als initial-Frische nehmen — Traccar-Refresh kann sie gleich ueberschreiben
      var dbPositionAgeMinutes = dbAge;
    }

    // ON-DEMAND POSITION REFRESH: Tracker-Sync läuft "nur" jede Minute — beim Rückgabe-
    // Klick holen wir noch eine FRISCHE Position direkt von Traccar, damit der Mieter
    // nicht auf einer veralteten Position basiert geblockt wird.
    let returnLat = trailerNow?.last_lat || null;
    let returnLng = trailerNow?.last_lng || null;
    let positionAgeMinutes = null; // Wie alt ist die Position die wir gleich pruefen?
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
              // fixTime = wann der Tracker die Position GEMESSEN hat (nicht wann wir sie holen).
              // Bei Sleep-Mode kann das deutlich aelter sein als jetzt.
              const fixTime = pos.fixTime || pos.deviceTime;
              if (fixTime) positionAgeMinutes = (Date.now() - new Date(fixTime).getTime()) / 60000;
              await supabase.from('trailers').update({
                last_lat: freshLat, last_lng: freshLng,
                last_seen_at: fixTime || new Date().toISOString()
              }).eq('id', booking.trailer_id);
            }
          }
        }
      } catch (refreshErr) {
        // Fail-soft: bei Timeout/Fehler nehmen wir den DB-Wert (max. 60s alt)
        console.warn('Traccar on-demand refresh fehlgeschlagen:', refreshErr.message);
      }
    }
    // Fallback: wenn Traccar nicht erreichbar war, Frische ueber DB-Spalte
    if (positionAgeMinutes === null) {
      positionAgeMinutes = (typeof dbPositionAgeMinutes === 'number') ? dbPositionAgeMinutes : 999;
    }
    // STALE-POSITION-SCHWELLE: laenger als 15 Min ohne Position-Update = nicht vertrauenswuerdig
    const POSITION_STALE_MIN = 15;
    const positionIsStale = positionAgeMinutes > POSITION_STALE_MIN;

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
    // NEUE LOGIK (Tier/Lime-Style):
    // - Tracker frisch (<=15 Min) → Tracker entscheidet
    // - Tracker stale (>15 Min) UND Mieter sagt "in Zone" → pending_position_check (Cron prueft spaeter)
    // - Tracker stale UND Mieter sagt "ausserhalb" → sofort Fee chargen (Mieter hat selbst zugegeben)
    // - Tracker fehlt komplett + Mieter "in Zone" → pending_position_check
    // - Tracker fehlt + Mieter "ausserhalb" → sofort Fee chargen
    const mieterSagtAusserhalb = (mieter_confirmed_in_zone === false);

    if (returnLat != null && booking.pickup_lat != null) {
      returnDistanceM = distMeters(booking.pickup_lat, booking.pickup_lng, returnLat, returnLng);
      const insideBremen = inBremen(returnLat, returnLng);
      const ffKnown = booking.free_floating === true || booking.free_floating === false;

      if (!positionIsStale) {
        // === Tracker frisch — Tracker entscheidet ===
        if (returnDistanceM <= 500) {
          returnStatus = 'heimat';
        } else if (!insideBremen) {
          if (ffKnown) { returnStatus = 'outside_bremen'; returnExtraFee = 50.00; }
          else { returnStatus = 'outside_bremen'; }
        } else if (booking.free_floating === true) {
          returnStatus = 'free_floating_ok';
        } else if (booking.free_floating === false) {
          returnStatus = 'wrong_spot_in_bremen';
          returnExtraFee = 50.00;
        } else {
          returnStatus = 'heimat';
        }
      } else {
        // === Tracker stale — Mieter-Bestaetigung greift ===
        if (mieterSagtAusserhalb) {
          // Mieter hat selbst zugegeben → sofort Fee
          returnStatus = 'outside_confirmed_by_mieter';
          returnExtraFee = 50.00;
        } else {
          // Mieter sagt in Zone — Cron prueft spaeter
          returnStatus = 'pending_position_check';
        }
      }
    } else if (booking.pickup_lat != null) {
      // Tracker hat NIE Position geliefert (returnLat==null)
      if (mieterSagtAusserhalb) {
        returnStatus = 'outside_confirmed_by_mieter';
        returnExtraFee = 50.00;
      } else {
        returnStatus = 'pending_position_check';
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
        // SOFORT Lion alarmieren — Rückgabe-Aufpreis manuell einziehen.
        try {
          await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: 'info@simpletrailer.de',
            subject: `⚠ OFFENE FORDERUNG: ${returnExtraFee.toFixed(2)} € Rückgabe-Aufpreis NICHT eingezogen — #${booking_id.slice(0,8).toUpperCase()}`,
            text: `Die automatische Abbuchung des Rückgabe-Aufpreises ist FEHLGESCHLAGEN — bitte manuell einziehen.\n\nKunde:   ${booking.customer_name} (${booking.customer_email})\nBuchung: #${booking_id.slice(0,8).toUpperCase()}\nBetrag:  ${returnExtraFee.toFixed(2)} € (${returnStatus})\nGrund:   ${stripeErr.code || stripeErr.decline_code || stripeErr.message}\n\nEinziehen: Stripe → Payment Links → ${returnExtraFee.toFixed(2)} € → an ${booking.customer_email} senden.`
          });
        } catch (e) { console.error('Alarm-Mail (extra_fee) fehlgeschlagen:', e.message); }
      }
    }

    // Bei pending_position_check: Buchung bleibt offen, Cron schliesst ab sobald Tracker meldet.
    const isPending = returnStatus === 'pending_position_check';
    const bookingUpdate = {
      status: isPending ? 'pending_position_check' : 'returned',
      actual_return_time: now.toISOString(),
      return_photo_url: photo_url || null,
      late_fee_amount: lateFeeAmount,
      late_fee_payment_intent_id: lateFeePaymentIntentId,
    };
    // Neue Felder optional anhängen — DB-Fallback wenn Migration noch nicht durchgelaufen.
    const bookingUpdateWithZone = { ...bookingUpdate,
      ladeflaeche_photo_url: ladeflaeche_photo_url || null,
      return_lat: returnLat, return_lng: returnLng,
      return_distance_m: returnDistanceM,
      return_status: returnStatus,
      return_extra_fee: returnExtraFee,
      // Pending-Felder + Mieter-Bestaetigung speichern
      position_check_started_at: isPending ? now.toISOString() : null,
      mieter_confirmed_in_zone: (typeof mieter_confirmed_in_zone === 'boolean') ? mieter_confirmed_in_zone : null,
      mieter_geo_lat: (typeof mieter_geo_lat === 'number') ? mieter_geo_lat : null,
      mieter_geo_lng: (typeof mieter_geo_lng === 'number') ? mieter_geo_lng : null,
    };
    let { error: updErr } = await supabase.from('bookings').update(bookingUpdateWithZone).eq('id', booking_id);
    if (updErr && /column .* does not exist/i.test(updErr.message || '')) {
      console.warn('Return-Zone-Spalten fehlen — fallback ohne Zone-Felder. Migration ausfuehren!');
      await supabase.from('bookings').update(bookingUpdate).eq('id', booking_id);
    }

    // is_available wird nicht mehr verändert — der Flag markiert nur "im Service / Wartung".
    // Verfügbarkeit nach Rückgabe ergibt sich automatisch aus status='returned' der Buchung
    // (get-trailers.js berechnet currently_booked zeitbasiert).

    const total = booking.total_amount + lateFeeAmount;
    const bookingRef = booking_id.slice(0, 8).toUpperCase();

    const lateBlock = lateFeeAmount > 0
      ? T.callout(`<strong>Verspätungsaufpreis</strong><br>${lateHours} Stunde${lateHours > 1 ? 'n' : ''} × ${lateFeePerHour.toFixed(2)} € = <strong>${lateFeeAmount.toFixed(2)} €</strong><br><span style="font-size:13px;color:#8A857D;">${lateFeeCharged ? '✓ Automatisch abgebucht.' : '⚠ Automatische Abbuchung fehlgeschlagen. Wir melden uns.'}</span>`, 'orange')
      : T.callout('<strong>✓ Pünktlich zurückgegeben – danke!</strong>', 'green');

    // Review-CTA: nur wenn pünktlich zurückgegeben (positive Erfahrung)
    const reviewBlock = lateFeeAmount > 0 ? '' :
      `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px;"><tr><td align="center" style="background:#F6F3EE;border:1px solid #E7E2D9;border-radius:12px;padding:22px 20px;">
        <div style="font-size:24px;letter-spacing:5px;color:#E85D00;margin-bottom:6px;">★★★★★</div>
        <div style="font-weight:700;font-size:15px;color:#111213;margin-bottom:6px;font-family:system-ui,sans-serif;">Wie war deine Erfahrung?</div>
        <div style="color:#5C5953;font-size:13px;margin-bottom:16px;line-height:1.5;font-family:system-ui,sans-serif;">Eine kurze Google-Bewertung hilft uns, weiter zu wachsen — und anderen, uns zu finden.</div>
        <a href="https://g.page/r/Cd6jwKdwS_Y7EAE/review" style="display:inline-block;background:#E85D00;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;font-family:system-ui,sans-serif;">Auf Google bewerten →</a>
      </td></tr></table>`;

    // Bei pending_position_check: Mieter bekommt erstmal "wir warten auf Tracker"-Mail.
    // Die finale Abrechnung schickt der Cron sobald die Position bestaetigt ist.
    if (isPending) {
      try {
        await resend.emails.send({
          from: 'SimpleTrailer <buchung@simpletrailer.de>',
          reply_to: 'info@simpletrailer.de',
          to: booking.customer_email,
          subject: `Rückgabe vermerkt #${bookingRef} – wir bestätigen final per E-Mail`,
          html: T.layout({
            heading: '⏳ Rückgabe vermerkt',
            preheader: 'Wir bestätigen die finale Abrechnung in Kürze per E-Mail.',
            bodyHtml:
              T.p(`Hallo ${T.esc(booking.customer_name)},<br>danke für die Rückgabe! Der GPS-Tracker am Anhänger meldet sich nicht immer sofort — manchmal dauert es bis zu einer Stunde, bis die finale Position übermittelt wird.`) +
              T.p('Sobald der Tracker sich gemeldet hat, prüfen wir automatisch, ob der Anhänger im Zone-Bereich steht, und schicken dir die finale Abrechnung per E-Mail. Du musst nichts weiter tun.') +
              T.rows([['Buchungsnummer', `#${bookingRef}`]])
          })
        });
      } catch (mailErr) {
        console.error('Pending-Mail fehlgeschlagen:', mailErr.message);
      }
      return res.status(200).json({
        success: true,
        return_status: 'pending_position_check',
        late_hours: lateHours,
        late_fee: lateFeeAmount,
        late_fee_charged: lateFeeCharged
      });
    }

    await resend.emails.send({
      from: 'SimpleTrailer <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: booking.customer_email,
      subject: `Rückgabe bestätigt #${bookingRef} – SimpleTrailer`,
      html: T.layout({
        heading: 'Rückgabe bestätigt ✓',
        preheader: `Deine Abrechnung — Gesamt ${total.toFixed(2)} €`,
        replyNote: 'Fragen? Antworte einfach auf diese Mail.',
        bodyHtml:
          T.p(`Hallo ${T.esc(booking.customer_name)}, hier deine Abrechnung.`) +
          lateBlock +
          T.rows([
            ['Buchung', `#${bookingRef}`],
            ['Mietbetrag', `${booking.total_amount.toFixed(2)} €`],
            ...(lateFeeAmount > 0 ? [['Verspätung', `<span style="color:#E85D00;">+ ${lateFeeAmount.toFixed(2)} €</span>`]] : []),
            ['Gesamt', `${total.toFixed(2)} €`]
          ]) +
          reviewBlock
      })
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
