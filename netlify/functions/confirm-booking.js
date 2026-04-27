// Legacy-Alias: confirm-booking.js wird intern weitergeleitet auf booking.js (POST)
// (Falls externe Systeme noch /api/confirm-booking aufrufen)
const handler = require('../../api/booking.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
