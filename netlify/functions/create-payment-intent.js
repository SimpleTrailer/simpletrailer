const handler = require('../../api/create-payment-intent.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
