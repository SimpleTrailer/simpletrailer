const handler = require('../../api/get-user-bookings.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
