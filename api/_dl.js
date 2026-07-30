/**
 * Führerschein-Daten: EINE geteilte Lese-/Schreibschicht (Underscore = kein Endpoint).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WARUM ES DIESE DATEI GIBT — bitte vor jeder Änderung lesen.
 *
 * Bis 30.07.2026 lagen dl_status & Co. in Supabase in `user_metadata`.
 * Das war eine offene Tür: `user_metadata` ist über
 *     PUT {SUPABASE_URL}/auth/v1/user   mit dem Anon-Key + eigenem Access-Token
 * vom KUNDEN SELBST beschreibbar (account.html und der Signup in booking.html
 * nutzen genau diesen Weg für Name/Telefon/Adresse). Ein Angreifer konnte damit
 * einfach `{"data":{"dl_status":"verified","dl_classes":["BE"]}}` senden und war
 * ohne ein einziges Foto und ohne Einwilligung verifiziert — das komplette
 * Führerschein-Gate war wirkungslos.
 *
 * `app_metadata` ist dagegen NUR mit dem Service-Key (also serverseitig)
 * beschreibbar. Deshalb liegen alle sicherheitsrelevanten Felder jetzt dort.
 *
 * REGELN:
 *  - Lesen NUR über readLicense(). Niemals wieder user_metadata für dl_* lesen —
 *    sonst ist die Lücke sofort zurück.
 *  - Schreiben NUR über writeLicense() (nutzt den Service-Key).
 *  - Reine Profildaten (first_name, phone, address …) bleiben in user_metadata,
 *    die darf der Kunde selbst pflegen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Felder, die ausschliesslich der Server setzen darf. */
const SERVER_OWNED = [
  'dl_status', 'dl_classes', 'dl_expires_at',
  'dl_first_name', 'dl_last_name', 'dl_dob',
  'dl_doc_number', 'dl_doc_type', 'dl_issuing_country',
  'dl_verified_at', 'dl_failure_reason', 'dl_check_method',
  'dl_review_reason', 'dl_review_started_at',
  'dl_rejected_reason', 'dl_rejected_at', 'dl_rejected_by',
  'dl_manual', 'dl_manual_by', 'dl_prev_failure_reason',
  'dl_consent_at', 'dl_consent_version', 'dl_consent_ip',
  'dl_address', 'dl_session_id', 'dl_stripe_session_id',
  'mollie_customer_id'
];

/**
 * Führerschein-Daten eines Nutzers lesen — ausschliesslich aus app_metadata.
 * @param {object} user  Supabase-User-Objekt (aus getUser / admin.getUserById)
 */
function readLicense(user) {
  const app = (user && user.app_metadata) || {};
  const out = {};
  for (const k of SERVER_OWNED) if (app[k] !== undefined) out[k] = app[k];
  if (!out.dl_status) out.dl_status = 'unverified';
  return out;
}

/** Kurzform: darf dieser Nutzer buchen? */
function isVerified(user) {
  return readLicense(user).dl_status === 'verified';
}

/**
 * Führerschein-Daten schreiben. Vorhandene app_metadata bleibt erhalten,
 * `patch` wird darübergelegt. Nur Felder aus SERVER_OWNED werden übernommen —
 * so kann ein durchgereichtes Objekt nie versehentlich Supabase-eigene Felder
 * (provider, providers …) überschreiben.
 *
 * @param {object} supabase  Client MIT Service-Key
 * @param {object} user      aktuelles User-Objekt (für die bestehende app_metadata)
 * @param {object} patch     zu setzende Felder; null löscht ein Feld
 */
async function writeLicense(supabase, user, patch) {
  const current = (user && user.app_metadata) || {};
  const next = { ...current };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!SERVER_OWNED.includes(k)) continue;
    next[k] = v;
  }
  const { error } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: next });
  if (error) throw new Error('Führerschein-Daten konnten nicht gespeichert werden: ' + error.message);
  return next;
}

/**
 * Altlast-Erkennung: liegen bei diesem Nutzer noch dl_*-Felder in user_metadata?
 * Nur für das Migrationsskript und zur Kontrolle im Admin — NIE als Lesequelle
 * für eine Berechtigungsentscheidung verwenden.
 */
function hasLegacyMetadata(user) {
  const um = (user && user.user_metadata) || {};
  return SERVER_OWNED.some(k => um[k] !== undefined);
}

module.exports = { readLicense, writeLicense, isVerified, hasLegacyMetadata, SERVER_OWNED };
