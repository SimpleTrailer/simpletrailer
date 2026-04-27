// Legacy-Alias: admin-data.js wird intern weitergeleitet auf admin.js
const handler = require('../../api/admin.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
