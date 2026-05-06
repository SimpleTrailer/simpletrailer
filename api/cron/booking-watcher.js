/**
 * SimpleTrailer Cron: Booking-Watcher (neue Buchung sofort melden)
 *
 * Läuft alle 2 Min. Findet bookings.created_at > last_seen_booking_id-Zeit,
 * sendet Mail an Lion mit Buchungs-Details. Respektiert Tabu-Regel auf
 * api/booking.js (kein Eingriff dort).
 *
 * Latenz: max 2 Min vs. echtzeitige Stripe-Webhooks. Akzeptabel.
 */
const { createClient } = require('@supabase/supabase-js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // State holen
    const { data: state } = await supabase
      .from('booking_watcher_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    const lastCheckAt = state?.last_check_at || new Date(Date.now() - 5 * 60000).toISOString();

    // Neue Buchungen seit lastCheckAt mit Status confirmed/active
    const { data: newBookings } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_email, total_amount,
        pricing_type, start_time, end_time, status, created_at,
        trailers(name)
      `)
      .gt('created_at', lastCheckAt)
      .in('status', ['confirmed', 'active', 'returned'])
      .order('created_at', { ascending: true });

    if (!newBookings || newBookings.length === 0) {
      // State trotzdem updaten
      await supabase.from('booking_watcher_state').upsert({
        id: 1,
        last_check_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      return res.status(200).json({ ok: true, new_bookings: 0 });
    }

    // Pro Buchung Push
    for (const b of newBookings) {
      const tarifLabels = { flexible: 'Individuell', day: 'Ganzer Tag', weekend: 'Wochenende', week: '1 Woche' };
      const startStr = new Date(b.start_time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const endStr = new Date(b.end_time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

      await pushLion({
        severity: 'green',
        category: 'alert',
        title: `Neue Buchung: ${b.customer_name} · ${(b.total_amount || 0).toFixed(2).replace('.', ',')} €`,
        htmlBody: `
          <table style="width:100%;font-size:.92rem;line-height:1.6;">
            <tr><td style="color:#888;width:35%;">Mieter</td><td><strong>${b.customer_name}</strong></td></tr>
            <tr><td style="color:#888;">Email</td><td>${b.customer_email}</td></tr>
            <tr><td style="color:#888;">Anhänger</td><td>${b.trailers?.name || 'PKW-Anhänger'}</td></tr>
            <tr><td style="color:#888;">Tarif</td><td>${tarifLabels[b.pricing_type] || b.pricing_type}</td></tr>
            <tr><td style="color:#888;">Von</td><td>${startStr} Uhr</td></tr>
            <tr><td style="color:#888;">Bis</td><td>${endStr} Uhr</td></tr>
            <tr><td style="color:#888;">Buchungs-ID</td><td><code>#${b.id.slice(0,8).toUpperCase()}</code></td></tr>
          </table>
        `,
        link: 'https://simpletrailer.de/admin',
      });
    }

    // last_seen + last_check updaten
    const lastBookingId = newBookings[newBookings.length - 1].id;
    await supabase.from('booking_watcher_state').upsert({
      id: 1,
      last_seen_booking_id: lastBookingId,
      last_check_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return res.status(200).json({ ok: true, new_bookings: newBookings.length });
  } catch (err) {
    console.error('booking-watcher:', err);
    return res.status(500).json({ error: err.message });
  }
};
