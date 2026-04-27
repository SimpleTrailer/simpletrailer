const handler = require('../../api/get-availability.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
