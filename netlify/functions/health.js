const handler = require('../../api/health.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
