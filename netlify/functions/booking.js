const handler = require('../../api/booking.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
