// Stripe-Webhook braucht den RAW Request-Body fuer die Signatur-Pruefung
const handler = require('../../api/stripe-webhook.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler, { rawBody: true });
