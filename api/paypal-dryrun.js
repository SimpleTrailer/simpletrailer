/**
 * EINMAL-DIAGNOSE (temporär) — prüft ob Stripe PayPal weiterhin im Checkout
 * anbietet, wenn wir setup_future_usage: 'off_session' für PayPal verlangen.
 * Legt NUR nicht-bestätigte PaymentIntents an (keine Zahlung), storniert sie
 * sofort und löscht den Test-Kunden. Wird nach dem Test wieder entfernt.
 * Schutz: Einmal-Token (kein CRON_SECRET nötig).
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const DRYRUN_TOKEN = '01dd3d6ef569d314d103f993d16dd30d0e09e626e81b97d4';

module.exports = async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
  if (token !== DRYRUN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'STRIPE_SECRET_KEY fehlt' });

  const out = { keyMode: process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'live' : 'test' };
  let customer;
  try {
    customer = await stripe.customers.create({ description: 'paypal-dryrun-DELETE' });

    // A) MIT paypal off_session (genau wie die geplante Änderung)
    try {
      const A = await stripe.paymentIntents.create({
        amount: 1200, currency: 'eur', customer: customer.id,
        automatic_payment_methods: { enabled: true },
        payment_method_options: {
          card:   { setup_future_usage: 'off_session' },
          link:   { setup_future_usage: 'off_session' },
          paypal: { setup_future_usage: 'off_session' }
        }
      });
      out.withPaypalOffSession = {
        ok: true,
        payment_method_types: A.payment_method_types,
        paypal_present: (A.payment_method_types || []).includes('paypal')
      };
      await stripe.paymentIntents.cancel(A.id).catch(() => {});
    } catch (eA) {
      out.withPaypalOffSession = { ok: false, error: eA.message, code: eA.code, type: eA.type };
    }

    // B) Baseline OHNE paypal-Option (heutiger Zustand)
    const B = await stripe.paymentIntents.create({
      amount: 1200, currency: 'eur', customer: customer.id,
      automatic_payment_methods: { enabled: true },
      payment_method_options: {
        card: { setup_future_usage: 'off_session' },
        link: { setup_future_usage: 'off_session' }
      }
    });
    out.baseline = {
      payment_method_types: B.payment_method_types,
      paypal_present: (B.payment_method_types || []).includes('paypal')
    };
    await stripe.paymentIntents.cancel(B.id).catch(() => {});
  } catch (e) {
    out.fatal = e.message;
  } finally {
    if (customer) await stripe.customers.del(customer.id).catch(() => {});
  }

  return res.status(200).json(out);
};
