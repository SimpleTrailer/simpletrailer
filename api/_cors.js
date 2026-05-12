/**
 * Geteilter CORS-Helper für SimpleTrailer-API.
 *
 * Statt Wildcard '*' nur erlaubte Origins durchlassen. Bei Auth-protected
 * Endpoints (Bearer-Token) reduziert das die Angriffsfläche für Token-Diebstahl
 * über kompromittierte Drittseiten.
 *
 * Nutzung:
 *   const { setCors } = require('./_cors');
 *   module.exports = async (req, res) => {
 *     setCors(req, res);
 *     if (req.method === 'OPTIONS') return res.status(200).end();
 *     ...
 *   };
 */

// Erlaubte Origins — eigene Domain + Mobile-App (Capacitor) + lokale Dev.
const ALLOWED_ORIGINS = [
  'https://simpletrailer.de',
  'https://www.simpletrailer.de',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  // Bekannter Origin → echo back. Sonst → eigene Prod-Domain als Default.
  // Vercel-Preview-Deployments matchen *.vercel.app — die lassen wir auch durch.
  let allowed;
  if (ALLOWED_ORIGINS.includes(origin)) {
    allowed = origin;
  } else if (origin.endsWith('.vercel.app')) {
    allowed = origin;
  } else {
    allowed = 'https://simpletrailer.de';
  }
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { setCors, ALLOWED_ORIGINS };
