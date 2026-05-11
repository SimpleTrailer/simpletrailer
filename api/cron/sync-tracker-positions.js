/**
 * SimpleTrailer Cron: GPS-Tracker-Positionen synchronisieren
 *
 * Läuft jede Minute. Holt aktuelle Positionen aus Traccar Cloud → speichert
 * sie in Supabase (trailers.last_lat/lng + trailer_positions Historie).
 *
 * Diebstahl-Alarm-Logik:
 *   Wenn Anhänger sich >300m vom letzten "Heimat-Standort" entfernt UND
 *   keine aktive Buchung läuft (bookings.status NOT IN ('confirmed','active'))
 *   → 🚨 Urgent-Mail + Push + Eintrag in theft_alerts.
 *
 * ENV-Variablen:
 *   TRACCAR_URL       → z.B. "https://server.traccar.org"  (Cloud) oder eigene
 *   TRACCAR_USERNAME  → Login-Mail
 *   TRACCAR_PASSWORD  → Login-Passwort
 *   CRON_SECRET       → Auth für diesen Endpoint
 *
 * Trailer in Supabase brauchen:
 *   tracker_imei (15-stellig)  → einmalig manuell in Supabase Dashboard eintragen
 *   tracker_traccar_id         → wird beim 1. Sync automatisch gefüllt
 */
const { createClient } = require('@supabase/supabase-js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Haversine-Distanz in Metern
function distanceMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lat2 == null) return 0;
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

async function traccarApi(path) {
  const auth = Buffer.from(`${process.env.TRACCAR_USERNAME}:${process.env.TRACCAR_PASSWORD}`).toString('base64');
  const r = await fetch(`${process.env.TRACCAR_URL}${path}`, {
    headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`Traccar ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.TRACCAR_URL || !process.env.TRACCAR_USERNAME) {
    return res.status(200).json({ ok: false, msg: 'Traccar nicht konfiguriert (ENVs fehlen) — Setup läuft noch' });
  }

  try {
    // 1) Alle Trailer mit IMEI laden
    const { data: trailers, error: trailerErr } = await supabase
      .from('trailers')
      .select('id, name, tracker_imei, tracker_traccar_id, last_lat, last_lng, last_seen_at');
    if (trailerErr) throw trailerErr;

    const withImei = (trailers || []).filter(t => t.tracker_imei);
    if (!withImei.length) {
      await supabase.from('tracker_sync_state').upsert({
        id: 1, last_sync_at: new Date().toISOString(), last_sync_ok: true,
        last_error: null, consecutive_errors: 0, positions_received: 0,
      }, { onConflict: 'id' });
      return res.status(200).json({ ok: true, msg: 'Keine Trailer mit IMEI eingetragen' });
    }

    // 2) Traccar-Devices abrufen (IMEI → traccar_id Mapping pflegen)
    const devices = await traccarApi('/api/devices');
    const imeiToDevice = {};
    devices.forEach(d => { if (d.uniqueId) imeiToDevice[String(d.uniqueId)] = d; });

    // Trailer ohne traccar_id mit IMEI matchen + Spalte füllen
    for (const t of withImei) {
      const dev = imeiToDevice[String(t.tracker_imei)];
      if (dev && t.tracker_traccar_id !== dev.id) {
        await supabase.from('trailers').update({ tracker_traccar_id: dev.id }).eq('id', t.id);
        t.tracker_traccar_id = dev.id;
      }
    }

    // 3) Aktuelle Positionen abrufen (für alle device-IDs gleichzeitig)
    const deviceIds = withImei.map(t => t.tracker_traccar_id).filter(Boolean);
    if (!deviceIds.length) {
      return res.status(200).json({ ok: true, msg: 'Trailer-IMEIs noch nicht in Traccar registriert' });
    }
    const positions = await traccarApi(`/api/positions?deviceId=${deviceIds.join('&deviceId=')}`);

    // 4) Updates pro Trailer
    let positionsStored = 0;
    let theftAlertsFired = 0;
    const nowIso = new Date().toISOString();

    for (const t of withImei) {
      const pos = positions.find(p => p.deviceId === t.tracker_traccar_id);
      if (!pos) continue;

      const lat = parseFloat(pos.latitude);
      const lng = parseFloat(pos.longitude);
      const speedKmh = pos.speed ? Math.round(pos.speed * 1.852 * 100) / 100 : 0; // Knoten→km/h
      const battery = pos.attributes?.batteryLevel || null;
      const isMoving = speedKmh > 3; // Threshold: 3 km/h
      const recordedAt = pos.fixTime || pos.deviceTime || nowIso;

      // Trailer-Tabelle updaten
      await supabase.from('trailers').update({
        last_lat: lat,
        last_lng: lng,
        last_seen_at: recordedAt,
        last_speed_kmh: speedKmh,
        last_battery_percent: battery,
        is_moving: isMoving,
      }).eq('id', t.id);

      // Historie eintragen (nur wenn Position sich geändert hat, sonst Spam)
      const distFromLast = distanceMeters(t.last_lat, t.last_lng, lat, lng);
      if (distFromLast > 10 || !t.last_lat) {
        await supabase.from('trailer_positions').insert({
          trailer_id: t.id, lat, lng, speed_kmh: speedKmh,
          heading_degrees: pos.course ? Math.round(pos.course) : null,
          battery_percent: battery, recorded_at: recordedAt,
        });
        positionsStored++;
      }

      // 5) Diebstahl-Alarm-Check: Bewegung außerhalb aktiver Buchung?
      if (isMoving && distFromLast > 300) {
        const { data: activeBookings } = await supabase
          .from('bookings')
          .select('id, status, start_time, end_time')
          .eq('trailer_id', t.id)
          .in('status', ['confirmed', 'active'])
          .gte('end_time', new Date(Date.now() - 30 * 60000).toISOString())
          .lte('start_time', new Date(Date.now() + 30 * 60000).toISOString());

        if (!activeBookings || activeBookings.length === 0) {
          // Doppelte Alarme in 1h vermeiden
          const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
          const { data: recentAlerts } = await supabase
            .from('theft_alerts').select('id')
            .eq('trailer_id', t.id).eq('status', 'open')
            .gte('triggered_at', oneHourAgo).limit(1);

          if (!recentAlerts || recentAlerts.length === 0) {
            await supabase.from('theft_alerts').insert({
              trailer_id: t.id,
              start_lat: t.last_lat, start_lng: t.last_lng,
              current_lat: lat, current_lng: lng,
              distance_meters: distFromLast,
              status: 'open',
            });

            const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
            await pushLion({
              severity: 'critical',
              category: 'urgent',
              title: `🚨 DIEBSTAHL-ALARM: ${t.name} bewegt sich!`,
              htmlBody: `
                <p style="font-size:1.1rem;color:#ef4444;"><strong>${t.name}</strong> hat sich um <strong>${distFromLast}m</strong> bewegt — und es läuft KEINE aktive Buchung.</p>
                <p style="background:#1f0a0a;border-left:3px solid #ef4444;padding:12px;border-radius:6px;margin:16px 0;">
                  <strong>Aktuelle Position:</strong><br>
                  <a href="${mapsLink}" style="color:#60a5fa;">${lat.toFixed(6)}, ${lng.toFixed(6)} → Google Maps öffnen</a><br>
                  <strong>Geschwindigkeit:</strong> ${speedKmh} km/h<br>
                  <strong>Akku:</strong> ${battery != null ? battery + '%' : '—'}
                </p>
                <p><strong>So vorgehen:</strong></p>
                <ol>
                  <li>Position-Link klicken → live in Google Maps verfolgen</li>
                  <li>Bei echtem Diebstahl: Polizei anrufen (110) — Position weitergeben</li>
                  <li>Im Admin-Cockpit → AI-Stab → Diebstahl-Alarme → "False Alarm" markieren wenn Fehlalarm</li>
                </ol>
              `,
              link: mapsLink,
            });

            theftAlertsFired++;
          }
        }
      }
    }

    // 6) Sync-State updaten
    await supabase.from('tracker_sync_state').upsert({
      id: 1, last_sync_at: nowIso, last_sync_ok: true, last_error: null,
      consecutive_errors: 0, positions_received: positionsStored,
    }, { onConflict: 'id' });

    return res.status(200).json({
      ok: true, trailers_synced: withImei.length,
      positions_stored: positionsStored, theft_alerts: theftAlertsFired,
    });
  } catch (err) {
    console.error('sync-tracker-positions:', err);
    await supabase.from('tracker_sync_state').upsert({
      id: 1, last_sync_at: new Date().toISOString(), last_sync_ok: false,
      last_error: err.message,
    }, { onConflict: 'id' });
    return res.status(500).json({ error: err.message });
  }
};
