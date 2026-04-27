// Legacy-Alias: get-booking.js wird intern weitergeleitet auf booking.js (GET)
const handler = require('../../api/booking.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
