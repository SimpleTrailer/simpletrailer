/**
 * FCM Push-Notification Sender — HTTP V1 API (OAuth2 mit Service-Account).
 *
 * Defensiv: wenn FIREBASE_SERVICE_ACCOUNT_JSON nicht gesetzt -> skipped.
 *           wenn push_tokens-Tabelle fehlt -> skipped.
 *           wenn einzelner Token ungueltig -> nur dieser uebersprungen.
 *
 * Datei beginnt mit "_" -> Vercel ignoriert sie als Function-Endpoint.
 *
 * V1 API benoetigt:
 *   - Service-Account-JSON aus Firebase Console (Dienstkonten Tab)
 *   - OAuth2-Token wird hier on-the-fly aus dem JSON erzeugt (15 Min Cache)
 *   - POST an https://fcm.googleapis.com/v1/projects/{PROJECT_ID}/messages:send
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// In-memory Token-Cache (Lebensdauer 50 Min, OAuth-Token ist 60 Min gueltig)
let cachedAccessToken = null;
let cachedAccessTokenExp = 0;
let cachedProjectId = null;

function parseServiceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON ist kein valides JSON:', e.message);
    return null;
  }
}

function base64UrlEncode(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Erzeugt ein signiertes JWT fuer Google OAuth2 (Service-Account-Flow)
 * und tauscht es gegen ein Access-Token.
 */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessTokenExp > now + 60) {
    return cachedAccessToken;
  }

  const sa = parseServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) return null;

  cachedProjectId = sa.project_id;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const headerEnc  = base64UrlEncode(JSON.stringify(header));
  const payloadEnc = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerEnc}.${payloadEnc}`;

  // RSA-SHA256 Signatur mit dem Private-Key des Service-Accounts
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = base64UrlEncode(sign.sign(sa.private_key));

  const jwt = `${signingInput}.${signature}`;

  // Tausche JWT gegen Access-Token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('OAuth token exchange failed:', res.status, txt);
    return null;
  }
  const data = await res.json();
  cachedAccessToken = data.access_token;
  cachedAccessTokenExp = now + (data.expires_in || 3600);
  return cachedAccessToken;
}

/**
 * Sendet eine einzelne Push an einen einzelnen Token via V1 API.
 */
async function sendOne(accessToken, projectId, token, message) {
  const v1Message = {
    message: {
      token,
      notification: {
        title: message.title,
        body:  message.body
      },
      data: {
        ...(message.data || {}),
        // Strings only fuer FCM data-Payload
        ...(message.deep_link ? { deep_link: String(message.deep_link) } : {})
      },
      android: {
        notification: {
          channel_id: message.channel || 'bookings',
          color: '#E85D00',
          ...(message.deep_link ? { click_action: 'OPEN_DEEP_LINK' } : {})
        }
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } }
      }
    }
  };

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(v1Message)
  });

  if (res.ok) {
    return { ok: true };
  }
  const txt = await res.text();
  let parsed;
  try { parsed = JSON.parse(txt); } catch (e) { parsed = { error: txt }; }
  return { ok: false, status: res.status, error: parsed?.error?.message || txt };
}

/**
 * Hauptfunktion: an alle Geraete eines Users pushen.
 */
async function sendPushToUser(userId, message) {
  if (!userId) return { sent: 0, error: 'userId missing' };

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { sent: 0, skipped: true, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' };
  }
  const projectId = cachedProjectId;
  if (!projectId) return { sent: 0, error: 'project_id missing in service account' };

  // Tokens fuer User holen
  let tokens;
  try {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('id, token, platform')
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

  let sent = 0;
  const failed = [];
  const expired = [];

  for (const { id, token, platform } of tokens) {
    const result = await sendOne(accessToken, projectId, token, message);
    if (result.ok) {
      sent++;
    } else {
      failed.push({ token: token.slice(0, 12) + '…', platform, error: result.error });
      // Tokens die als ungueltig zurueckkommen direkt aus DB loeschen
      if (result.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(result.error || '')) {
        expired.push(id);
      }
    }
  }

  // Aufraeumen: abgelaufene Tokens loeschen damit DB nicht voll laeuft
  if (expired.length > 0) {
    await supabase.from('push_tokens').delete().in('id', expired).then(() => {}, () => {});
  }

  return { sent, failed: failed.length > 0 ? failed : undefined, expired: expired.length };
}

module.exports = { sendPushToUser };
