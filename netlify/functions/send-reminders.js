const handler = require('../../api/send-reminders.js');
const { wrap } = require('./_vercel-adapter.js');
exports.handler = wrap(handler);
