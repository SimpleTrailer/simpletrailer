/**
 * Vercel-zu-Netlify-Adapter
 *
 * Wickelt Vercel-style Handler `(req, res) => ...` zu Netlify-style
 * `(event, context) => { statusCode, headers, body }`.
 *
 * Vorteil: Die echte Logik bleibt in api/*.js. Wenn wir je zurück zu Vercel
 * wollen: vercel.json reaktivieren, fertig — keine Code-Migration.
 *
 * Verwendung in jedem netlify/functions/X.js:
 *   const handler = require('../../api/X.js');
 *   const { wrap } = require('./_vercel-adapter.js');
 *   exports.handler = wrap(handler);
 *
 * Für Endpoints die RAW body brauchen (z.B. Stripe-Webhook):
 *   exports.handler = wrap(handler, { rawBody: true });
 */

const { Readable } = require('stream');

function parseBody(event, rawBody) {
  if (rawBody || !event.body) {
    if (event.isBase64Encoded) return Buffer.from(event.body, 'base64');
    return event.body;
  }
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(event.body); } catch (e) { return event.body; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(event.body);
    const obj = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
  return event.body;
}

function makeReq(event, opts) {
  const body = parseBody(event, opts.rawBody);

  // Stream-Emulation für `req.on('data', ...)` Patterns (z.B. raw-body lesen)
  const rawBuf = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'utf8');

  const stream = Readable.from([rawBuf]);
  // Felder wie Vercel-Request
  stream.method  = event.httpMethod;
  stream.headers = event.headers || {};
  stream.query   = event.queryStringParameters || {};
  stream.body    = body;
  stream.url     = event.path + (event.rawQuery ? '?' + event.rawQuery : '');
  return stream;
}

function makeRes() {
  const state = {
    statusCode: 200,
    headers: {},
    body: '',
    isBase64Encoded: false,
    finished: false
  };

  const res = {
    setHeader(k, v) { state.headers[k] = String(v); return res; },
    getHeader(k) { return state.headers[k]; },
    removeHeader(k) { delete state.headers[k]; },
    status(code) { state.statusCode = code; return res; },
    writeHead(code, hdrs) {
      state.statusCode = code;
      if (hdrs) for (const k in hdrs) state.headers[k] = String(hdrs[k]);
      return res;
    },
    json(data) {
      if (!state.headers['Content-Type'] && !state.headers['content-type']) {
        state.headers['Content-Type'] = 'application/json';
      }
      state.body = JSON.stringify(data);
      state.finished = true;
      return res;
    },
    send(data) {
      if (data == null) { state.finished = true; return res; }
      state.body = typeof data === 'string' || Buffer.isBuffer(data) ? String(data) : JSON.stringify(data);
      state.finished = true;
      return res;
    },
    end(data) {
      if (data != null) {
        state.body = typeof data === 'string' || Buffer.isBuffer(data) ? String(data) : JSON.stringify(data);
      }
      state.finished = true;
      return res;
    },
    write(chunk) {
      state.body += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    },
    _state: state
  };
  return res;
}

function wrap(handler, opts = {}) {
  return async (event, context) => {
    const req = makeReq(event, opts);
    const res = makeRes();

    try {
      await handler(req, res);
    } catch (err) {
      console.error('[adapter] handler threw:', err);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message || 'Internal Server Error' })
      };
    }

    return {
      statusCode: res._state.statusCode,
      headers: res._state.headers,
      body: res._state.body,
      isBase64Encoded: res._state.isBase64Encoded
    };
  };
}

module.exports = { wrap };
