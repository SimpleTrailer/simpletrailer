const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function authUser(req, res) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Nicht autorisiert' });
    return null;
  }
  const token = auth.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Ungültiger Token' });
    return null;
  }
  return user;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const m = user.user_metadata || {};
    return res.status(200).json({
      dl_status:        m.dl_status      || 'unverified',
      dl_classes:       m.dl_classes     || [],
      dl_expires_at:    m.dl_expires_at  || null,
      dl_first_name:    m.dl_first_name  || null,
      dl_last_name:     m.dl_last_name   || null,
      dl_dob:           m.dl_dob         || null,
      dl_doc_number:    m.dl_doc_number  || null,
      dl_doc_type:      m.dl_doc_type    || null,
      dl_issuing_country: m.dl_issuing_country || null,
      dl_session_id:    m.dl_session_id  || null,
      dl_verified_at:   m.dl_verified_at || null,
      dl_failure_reason: m.dl_failure_reason || null
    });
  }

  if (req.method === 'POST') {
    try {
      const session = await stripe.identity.verificationSessions.create({
        type: 'document',
        options: {
          document: {
            allowed_types: ['driving_license'],
            require_matching_selfie: true,
            require_live_capture: true
          }
        },
        metadata: { user_id: user.id }
      });

      const newMeta = {
        ...(user.user_metadata || {}),
        dl_stripe_session_id: session.id,
        dl_status: 'pending',
        dl_failure_reason: null
      };
      await supabase.auth.admin.updateUserById(user.id, { user_metadata: newMeta });

      return res.status(200).json({
        client_secret: session.client_secret,
        session_id: session.id
      });
    } catch (err) {
      console.error('identity POST:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
