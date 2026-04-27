const handler = require('../../api/precheck.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
