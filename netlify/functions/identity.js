const handler = require('../../api/identity.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
