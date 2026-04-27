/**
 * FCM Push-Notification Sender (Helper, KEIN Endpoint).
 *
 * Aufgabe: an alle Geraete eines Users eine Push schicken.
 * Defensiv: wenn FCM_SERVER_KEY nicht gesetzt -> skipped, kein Crash.
 *
 * Datei beginnt mit "_" -> Vercel ignoriert sie als Function-Endpoint
 * (zaehlt nicht zum 12-Function-Limit auf Hobby).
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const FCM_URL = 'https://fcm.googleapis.com/fcm/send';

async function sendPushToUser(userId, message) {
  if (!process.env.FCM_SERVER_KEY) {
    return { sent: 0, skipped: true, reason: 'FCM_SERVER_KEY not configured' };
  }
  if (!userId) return { sent: 0, error: 'userId missing' };

  // 1. Tokens fuer User holen
  let tokens;
  try {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId);
    if (error) throw error;
    tokens = data || [];
  } catch (err) {
    if (/relation .* does not exist/i.test(err.message || '')) {
      return { sent: 0, skipped: true, reason: 'push_tokens table missing' };
    }
    return { sent: 0, error: err.message };
  }

  if (tokens.length === 0) return { sent: 0, reason: 'no tokens for user' };

  // 2. Per FCM versenden
  const payload = {
    notification: {
      title: message.title,
      body:  message.body
    },
    data: {
      ...(message.data || {}),
      click_action: message.deep_link || 'OPEN_APP'
    },
    android: {
      notification: {
        channel_id: message.channel || 'bookings',
        color: '#E85D00'
      }
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } }
    }
  };

  let sent = 0, failed = [];
  for (const { token, platform } of tokens) {
    try {
      const res = await fetch(FCM_URL, {
        method: 'POST',
        headers: {
          'Authorization': `key=${process.env.FCM_SERVER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: token, ...payload })
      });
      const data = await res.json();
      if (data.success === 1 || data.message_id) sent++;
      else failed.push({ token: token.slice(0, 12) + '…', platform, error: data.error || 'unknown' });
    } catch (e) {
      failed.push({ token: token.slice(0, 12) + '…', platform, error: e.message });
    }
  }
  return { sent, failed };
}

module.exports = { sendPushToUser };
