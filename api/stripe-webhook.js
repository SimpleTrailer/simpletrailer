const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { api: { bodyParser: false } };

const getRawBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => resolve(Buffer.from(data)));
  req.on('error', reject);
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook Signatur ungültig:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (stripeEvent.type === 'payment_intent.succeeded') {
      const pi = stripeEvent.data.object;
      if (pi.metadata?.type !== 'late_fee') {
        await supabase.from('bookings')
          .update({ status: 'confirmed' })
          .eq('stripe_payment_intent_id', pi.id)
          .eq('status', 'pending');

        // RECONCILE: Wenn der Browser nach der Zahlung abbrach, hat der Client
        // /api/booking nie aufgerufen -> Geld da, aber keine Buchung/Mail/Code.
        // Wir legen die Buchung dann serverseitig ueber denselben (idempotenten)
        // Endpoint an. Existiert sie schon, ist der Call ein No-Op.
        if (pi.metadata?.trailer_id) {
          const { data: row } = await supabase.from('bookings')
            .select('id').eq('stripe_payment_intent_id', pi.id).maybeSingle();
          if (!row) {
            const siteUrl = process.env.SITE_URL || 'https://www.simpletrailer.de';
            try {
              const r = await fetch(`${siteUrl}/api/booking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_intent_id: pi.id })
              });
              console.log('Webhook-Reconcile Buchung angelegt:', pi.id, r.status);
            } catch (e) {
              console.error('Webhook-Reconcile fehlgeschlagen:', pi.id, e.message);
            }
          }
        }
      }
    }

    if (stripeEvent.type === 'payment_intent.payment_failed') {
      const pi = stripeEvent.data.object;
      if (pi.metadata?.type === 'late_fee') {
        await supabase.from('bookings')
          .update({ late_fee_payment_intent_id: `FAILED:${pi.id}` })
          .eq('id', pi.metadata.booking_id);
      }
    }

    // Stripe Identity – Führerschein-Verifikation
    if (stripeEvent.type.startsWith('identity.verification_session.')) {
      await handleIdentityEvent(stripeEvent);
    }
  } catch (err) {
    console.error('Webhook Handler Fehler:', err);
  }

  return res.status(200).json({ received: true });
};

async function handleIdentityEvent(event) {
  const session = event.data.object;
  const userId  = session.metadata?.user_id;
  if (!userId) return;

  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  if (!user) return;

  const meta = { ...(user.user_metadata || {}) };

  if (event.type === 'identity.verification_session.verified') {
    // Vollständige Session mit verified_outputs holen
    const full = await stripe.identity.verificationSessions.retrieve(session.id, {
      expand: ['verified_outputs']
    });
    const out  = full.verified_outputs || {};
    const doc  = out.document || {};

    meta.dl_status      = 'verified';
    meta.dl_verified_at = new Date().toISOString();
    meta.dl_session_id  = session.id;
    meta.dl_first_name  = out.first_name || doc.first_name || null;
    meta.dl_last_name   = out.last_name  || doc.last_name  || null;
    meta.dl_expires_at  = doc.expiration_date
      ? `${doc.expiration_date.year}-${String(doc.expiration_date.month).padStart(2,'0')}-${String(doc.expiration_date.day).padStart(2,'0')}`
      : null;
    meta.dl_dob = (out.dob || doc.dob)
      ? `${(out.dob || doc.dob).year}-${String((out.dob || doc.dob).month).padStart(2,'0')}-${String((out.dob || doc.dob).day).padStart(2,'0')}`
      : null;
    meta.dl_doc_type    = doc.type || null;
    meta.dl_issuing_country = doc.issuing_country || null;
    meta.dl_doc_number  = doc.number || null;
    meta.dl_address     = out.address || null;
    // Stripe Identity gibt keine Klassen aus → für PKW-Anhänger <750kg reicht B
    // Wir gehen von Klasse B aus, sobald ein gültiger Führerschein verifiziert wurde
    meta.dl_classes = ['B'];
    meta.dl_failure_reason = null;

    // KEIN Überschreiben der Konto-Angaben: first_name/last_name/birthdate bleiben das,
    // was der Kunde bei der Registrierung selbst angegeben hat. Die geprüften Führerschein-
    // Daten liegen separat in dl_first_name/dl_last_name/dl_dob — so bleibt der Admin-Abgleich
    // (Konto ↔ Führerschein) aussagekräftig (man sieht Abweichungen). Buchung & Mietvertrag
    // nutzen ohnehin bevorzugt die dl_-Daten (siehe booking.html customer_name).
  }

  if (event.type === 'identity.verification_session.requires_input') {
    meta.dl_status = 'failed';
    meta.dl_failure_reason = session.last_error?.reason || session.last_error?.code || 'Verifikation fehlgeschlagen';
  }

  if (event.type === 'identity.verification_session.processing') {
    meta.dl_status = 'pending';
  }

  if (event.type === 'identity.verification_session.canceled') {
    meta.dl_status = 'unverified';
    meta.dl_failure_reason = null;
  }

  await supabase.auth.admin.updateUserById(userId, { user_metadata: meta });
}
