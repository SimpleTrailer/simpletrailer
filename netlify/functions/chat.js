const handler = require('../../api/chat.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
