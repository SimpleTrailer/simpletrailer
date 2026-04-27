/**
 * Push-Notification-Sender — Vorlage fuer die SimpleTrailer-Backend-Erweiterung
 *
 * Dies ist ein STUB / VORLAGE. Liegt absichtlich in mobile-app/server-stub/
 * (NICHT in ../api/), damit die LIVE-Webseite unangetastet bleibt.
 *
 * Wenn du Push-Notifications wirklich aktivierst:
 * 1. Firebase Cloud Messaging (FCM) Account anlegen
 * 2. google-services.json + GoogleService-Info.plist in App-Projekt legen
 * 3. FCM_SERVER_KEY aus Firebase Settings -> Cloud Messaging holen
 * 4. Diese Datei nach api/send-push.js kopieren (dort wird sie zur echten Vercel-Function)
 * 5. Tabelle push_tokens in Supabase anlegen (siehe SQL unten)
 * 6. send-reminders.js so erweitern, dass es zusaetzlich zu Mails auch Push verschickt
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Sendet eine Push-Notification an einen User (alle seine registrierten Geraete).
 * @param {string} userId - Supabase User ID
 * @param {object} message - { title, body, data?: object, channel?: 'bookings' | 'general' }
 */
async function sendPushToUser(userId, message) {
  // 1. Tokens fuer User holen
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token, platform')
    .eq('user_id', userId);
  if (error || !tokens?.length) return { sent: 0, reason: error?.message || 'no tokens' };

  // 2. An FCM senden
  const payload = {
    notification: {
      title: message.title,
      body:  message.body
    },
    data: {
      ...(message.data || {}),
      // Klick auf Notification soll App oeffnen
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    },
    android: {
      notification: {
        channel_id: message.channel || 'bookings',
        color: '#E85D00'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    }
  };

  let sent = 0, failed = [];
  for (const { token, platform } of tokens) {
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${FCM_SERVER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: token, ...payload })
      });
      const data = await res.json();
      if (data.success === 1 || data.message_id) sent++;
      else failed.push({ token, platform, error: data.error || data });
    } catch (e) {
      failed.push({ token, platform, error: e.message });
    }
  }

  return { sent, failed };
}

/**
 * Beispiel: Pickup-Erinnerung 24h vorher
 */
async function sendPickupReminder(booking) {
  return sendPushToUser(booking.user_id, {
    title: 'Anhaenger holen morgen 🛻',
    body:  `Deine Buchung beginnt morgen um ${formatTime(booking.start_time)}. Hier ist dein Code: ${booking.access_code}`,
    channel: 'bookings',
    data: { type: 'pickup_reminder', booking_id: booking.id, deep_link: 'simpletrailer://booking?id=' + booking.id }
  });
}

/**
 * Beispiel: Rueckgabe-Erinnerung 2h vorher
 */
async function sendReturnReminder(booking) {
  return sendPushToUser(booking.user_id, {
    title: 'Rueckgabe in 2 Stunden ⏰',
    body:  `Bitte gib den Anhaenger bis ${formatTime(booking.end_time)} zurueck.`,
    channel: 'bookings',
    data: { type: 'return_reminder', booking_id: booking.id }
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('de-DE', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
  });
}

module.exports = { sendPushToUser, sendPickupReminder, sendReturnReminder };

/* ==========================================================
 * SQL: push_tokens Tabelle
 * ========================================================== */
/* Fuehre das in Supabase SQL Editor aus:

create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, token)
);

create index push_tokens_user_idx on push_tokens(user_id);

-- RLS
alter table push_tokens enable row level security;
create policy "Users can manage own tokens"
  on push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

*/
