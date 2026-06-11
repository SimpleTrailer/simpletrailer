/**
 * SimpleTrailer Cron: Pending Returns bestaetigen
 *
 * Laeuft alle 5 Min. Sucht Buchungen mit status='pending_position_check'.
 *
 * Pro Buchung:
 *   1) Hole aktuelle Trailer-Position
 *   2) Wenn Tracker seit position_check_started_at frische Position gesendet hat:
 *      → Distanz zum Pickup berechnen, Status (heimat / outside) setzen, Fee chargen falls noetig
 *      → status='returned', Mail an Mieter (Abrechnung)
 *   3) Wenn > 1h vergangen UND immer noch keine frische Position:
 *      → Mieter-Bestaetigung gilt:
 *          - mieter_confirmed_in_zone=true → als heimat bestaetigen + Lion-Alert
 *          - mieter_confirmed_in_zone=false → 50€ Fee + Lion-Alert
 *          - keine Bestaetigung → Lion-Alert, manuelle Pruefung
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const RETURN_RADIUS_M = 500;
const GRACE_PERIOD_MIN = 60;

function distMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lat2 == null) return null;
  const R = 6371000, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const BREMEN_POLYGON = [
  [53.218, 8.625], [53.213, 8.690], [53.193, 8.732], [53.175, 8.745],
  [53.156, 8.792], [53.145, 8.890], [53.137, 8.940], [53.108, 8.960],
  [53.075, 8.985], [53.045, 8.980], [53.025, 8.890], [53.005, 8.838],
  [52.998, 8.798], [53.008, 8.700], [53.075, 8.598], [53.110, 8.580],
  [53.137, 8.598], [53.165, 8.620], [53.187, 8.620]
];
function inBremen(lat, lng) {
  if (lat == null || lng == null) return false;
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

async function chargeExtraFee(booking, amount, description) {
  if (!booking.stripe_payment_method_id || !booking.stripe_customer_id) return null;
  try {
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), currency: 'eur',
      customer: booking.stripe_customer_id,
      payment_method: booking.stripe_payment_method_id,
      confirm: true, off_session: true,
      receipt_email: booking.customer_email,
      description,
      metadata: { booking_id: booking.id, type: 'return_extra_fee_post_check' }
    });
    return pi.id;
  } catch (err) {
    console.error('chargeExtraFee fehlgeschlagen:', err.message);
    return null;
  }
}

async function sendFinalMail(booking, returnStatus, extraFee, extraFeeCharged) {
  const bookingRef = booking.id.slice(0, 8).toUpperCase();
  const inZoneOk = returnStatus === 'heimat';
  const subject = inZoneOk
    ? `✓ Rückgabe bestätigt #${bookingRef} – SimpleTrailer`
    : `Rückgabe-Abrechnung #${bookingRef} – Rückführungspauschale berechnet`;

  const feeBlock = extraFee > 0
    ? `<div style="background:#1a0d00;border:1.5px solid #f97316;border-radius:12px;padding:18px;margin:16px 0;">
         <p style="color:#fdba74;font-weight:700;margin:0 0 6px;font-size:.92rem;">Rückführungspauschale: ${extraFee.toFixed(2)} €</p>
         <p style="color:#fed7aa;font-size:.86rem;margin:0;line-height:1.5;">Der Anhänger wurde laut Tracker außerhalb der Rückgabe-Zone abgestellt. ${extraFeeCharged ? 'Der Betrag wurde automatisch abgebucht.' : 'Die Abbuchung ist fehlgeschlagen — wir melden uns.'}</p>
       </div>`
    : `<div style="background:#0a1f0a;border:1.5px solid #22c55e;border-radius:12px;padding:16px;margin:16px 0;">
         <p style="color:#86efac;font-weight:700;margin:0;">✓ Anhänger ordnungsgemäß zurückgegeben</p>
       </div>`;

  await resend.emails.send({
    from: 'SimpleTrailer <buchung@simpletrailer.de>',
    reply_to: 'info@simpletrailer.de',
    to: booking.customer_email,
    subject,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
        </div>
        <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;">
          <h1 style="margin:0 0 8px;font-size:1.4rem;">${inZoneOk ? 'Rückgabe bestätigt' : 'Rückgabe-Abrechnung'}</h1>
          <p style="color:#ccc;margin:0 0 8px;line-height:1.6;">Hallo ${booking.customer_name},</p>
          <p style="color:#ccc;margin:0 0 8px;line-height:1.6;">der Tracker hat sich gemeldet — hier die finale Abrechnung deiner Buchung <strong>#${bookingRef}</strong>.</p>
          ${feeBlock}
        </div>
        <p style="color:#444;font-size:.72rem;text-align:center;margin-top:24px;">SimpleTrailer · Bremen · info@simpletrailer.de</p>
      </div>
    </body></html>`
  });
}

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1]) || req.headers['x-cron-token'] ;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: pendings, error } = await supabase
      .from('bookings')
      .select('*, trailers(name, last_lat, last_lng, last_seen_at)')
      .eq('status', 'pending_position_check');
    if (error) throw error;

    const nowMs = Date.now();
    let processed = 0, resolved = 0, fallbackUsed = 0;

    for (const b of pendings || []) {
      processed++;
      const startedMs = b.position_check_started_at ? new Date(b.position_check_started_at).getTime() : nowMs;
      const lastSeenMs = b.trailers?.last_seen_at ? new Date(b.trailers.last_seen_at).getTime() : 0;
      const gracePassed = (nowMs - startedMs) > GRACE_PERIOD_MIN * 60 * 1000;
      const hasFreshPositionSinceCheck = lastSeenMs > startedMs;

      // Pfad 1: Tracker hat sich gemeldet — Distanz pruefen
      if (hasFreshPositionSinceCheck && b.trailers?.last_lat != null) {
        const dist = distMeters(b.pickup_lat, b.pickup_lng, b.trailers.last_lat, b.trailers.last_lng);
        let newStatus = 'heimat', fee = 0;
        if (dist > RETURN_RADIUS_M) {
          const insideBremen = inBremen(b.trailers.last_lat, b.trailers.last_lng);
          if (!insideBremen) { newStatus = 'outside_bremen'; fee = 50; }
          else if (b.free_floating === false) { newStatus = 'wrong_spot_in_bremen'; fee = 50; }
          else if (b.free_floating === true) { newStatus = 'free_floating_ok'; }
          else { newStatus = 'heimat'; }
        }
        let feePiId = null;
        if (fee > 0) {
          feePiId = await chargeExtraFee(b, fee,
            `SimpleTrailer – ${newStatus === 'outside_bremen' ? 'Rueckfuehrung ausserhalb Bremen' : 'Falsch-Rueckgabe'}`);
        }
        await supabase.from('bookings').update({
          status: 'returned',
          return_status: newStatus,
          return_extra_fee: fee,
          return_lat: b.trailers.last_lat,
          return_lng: b.trailers.last_lng,
          return_distance_m: dist,
          position_check_resolved_at: new Date().toISOString()
        }).eq('id', b.id);
        await sendFinalMail(b, newStatus, fee, !!feePiId);
        resolved++;
        continue;
      }

      // Pfad 2: Schonfrist abgelaufen — Mieter-Bestaetigung gilt (Fallback)
      if (gracePassed) {
        fallbackUsed++;
        const mieterSaidInZone  = b.mieter_confirmed_in_zone === true;
        const mieterSaidOutside = b.mieter_confirmed_in_zone === false;
        let newStatus, fee = 0, feePiId = null;
        if (mieterSaidInZone) {
          newStatus = 'heimat_mieter_confirmed';
        } else if (mieterSaidOutside) {
          newStatus = 'outside_confirmed_by_mieter';
          fee = 50;
          feePiId = await chargeExtraFee(b, fee, 'SimpleTrailer – Rueckfuehrungspauschale (Mieter bestaetigt)');
        } else {
          newStatus = 'pending_manual_review';
        }
        await supabase.from('bookings').update({
          status: newStatus === 'pending_manual_review' ? 'pending_position_check' : 'returned',
          return_status: newStatus,
          return_extra_fee: fee,
          position_check_resolved_at: newStatus !== 'pending_manual_review' ? new Date().toISOString() : null
        }).eq('id', b.id);
        if (newStatus !== 'pending_manual_review') {
          await sendFinalMail(b, newStatus === 'heimat_mieter_confirmed' ? 'heimat' : newStatus, fee, !!feePiId);
        }
        await pushLion({
          severity: newStatus === 'pending_manual_review' ? 'critical' : 'yellow',
          category: 'urgent',
          title: `Pending-Return abgelaufen: ${b.trailers?.name || 'Anhaenger'}`,
          htmlBody: `<p>Buchung <strong>#${b.id.slice(0,8).toUpperCase()}</strong> (${b.customer_name})</p>
            <p>Schonfrist von ${GRACE_PERIOD_MIN} Min abgelaufen ohne neue Tracker-Position.</p>
            <p><strong>Auto-Aktion:</strong> ${newStatus === 'heimat_mieter_confirmed' ? 'Heimat bestaetigt (Mieter-Bestaetigung)' : newStatus === 'outside_confirmed_by_mieter' ? '50€ Fee gechargt (Mieter hat selbst zugegeben)' : 'KEINE — manuelle Pruefung noetig'}</p>
            <p>Letzte bekannte Position: ${b.trailers?.last_lat?.toFixed(6)}, ${b.trailers?.last_lng?.toFixed(6)} (vor ${Math.round((nowMs - lastSeenMs) / 60000)} Min)</p>`,
          link: b.trailers?.last_lat ? `https://www.google.com/maps?q=${b.trailers.last_lat},${b.trailers.last_lng}` : undefined
        });
      }
      // Pfad 3: Noch in Schonfrist, warten — nichts tun
    }

    return res.status(200).json({ ok: true, processed, resolved, fallback_used: fallbackUsed });
  } catch (err) {
    console.error('confirm-pending-returns:', err);
    return res.status(500).json({ error: err.message });
  }
};
