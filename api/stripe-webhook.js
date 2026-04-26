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
    meta.dl_first_name  = out.first_name || doc.first_name || null;
    meta.dl_last_name   = out.last_name  || doc.last_name  || null;
    meta.dl_expires_at  = doc.expiration_date
      ? `${doc.expiration_date.year}-${String(doc.expiration_date.month).padStart(2,'0')}-${String(doc.expiration_date.day).padStart(2,'0')}`
      : null;
    // Stripe Identity gibt keine Klassen aus → für PKW-Anhänger <750kg reicht B
    // Wir gehen von Klasse B aus, sobald ein gültiger Führerschein verifiziert wurde
    meta.dl_classes = ['B'];
    meta.dl_failure_reason = null;
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
