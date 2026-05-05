const { createClient } = require('@supabase/supabase-js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });
  const token = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Ungültiger Token' });

  const section = req.query.section || 'data';

  try {
    if (section === 'users') {
      const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (usersError) throw usersError;
      const { data: bookings } = await supabase.from('bookings').select('customer_email, total_amount, status, created_at');
      const byEmail = {};
      for (const b of bookings || []) {
        if (!b.customer_email) continue;
        if (!byEmail[b.customer_email]) byEmail[b.customer_email] = { count: 0, total: 0 };
        byEmail[b.customer_email].count++;
        if (['confirmed','active','returned'].includes(b.status)) byEmail[b.customer_email].total += b.total_amount || 0;
      }
      const users = usersData.users.map(u => ({
        id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
        first_name: u.user_metadata?.first_name || '', last_name: u.user_metadata?.last_name || '',
        phone: u.user_metadata?.phone || '', confirmed: !!u.email_confirmed_at,
        bookings_count: byEmail[u.email]?.count || 0, bookings_total: byEmail[u.email]?.total || 0,
        dl_status:      u.user_metadata?.dl_status      || 'unverified',
        dl_classes:     u.user_metadata?.dl_classes     || [],
        dl_expires_at:  u.user_metadata?.dl_expires_at  || null,
        dl_verified_at: u.user_metadata?.dl_verified_at || null,
        dl_first_name:  u.user_metadata?.dl_first_name  || '',
        dl_last_name:   u.user_metadata?.dl_last_name   || '',
        dl_dob:         u.user_metadata?.dl_dob         || null,
        dl_doc_number:  u.user_metadata?.dl_doc_number  || null,
        dl_doc_type:    u.user_metadata?.dl_doc_type    || null,
        dl_issuing_country: u.user_metadata?.dl_issuing_country || null,
        dl_session_id:  u.user_metadata?.dl_session_id  || null,
      })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.status(200).json({ users });
    }

    if (section === 'social-posts') {
      try {
        const { data } = await supabase.from('social_posts_queue')
          .select('*')
          .order('scheduled_for', { ascending: false })
          .limit(30);
        return res.status(200).json({ posts: data || [] });
      } catch (e) {
        return res.status(200).json({ posts: [], error: 'social_posts_queue missing' });
      }
    }

    if (section === 'mark-posted' && req.method === 'POST') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error: updErr } = await supabase
        .from('social_posts_queue')
        .update({ status: 'posted', posted_at: new Date().toISOString(), posted_by: 'manual' })
        .eq('id', id);
      if (updErr) return res.status(500).json({ error: updErr.message });
      return res.status(200).json({ ok: true });
    }

    if (section === 'heartbeats') {
      // Live-Visitor-Count aus live_sessions (last_seen < 60s ago)
      const cutoff = new Date(Date.now() - 60000).toISOString();
      try {
        const { count } = await supabase.from('live_sessions')
          .select('*', { count: 'exact', head: true })
          .gte('last_seen', cutoff);
        return res.status(200).json({ active_visitors: count || 0 });
      } catch (e) {
        return res.status(200).json({ active_visitors: 0, error: 'live_sessions missing' });
      }
    }

    if (section === 'cockpit') {
      // Aggregierte Live-Daten + KPIs + AI-Insights fuer das Cockpit
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart  = new Date(Date.now() - 7 * 86400000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastWeekStart = new Date(Date.now() - 14 * 86400000).toISOString();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: bookings } = await supabase.from('bookings').select(`
        id, status, total_amount, late_fee_amount, pricing_type, insurance_type,
        start_time, end_time, actual_return_time, created_at, customer_email,
        stripe_payment_intent_id, late_fee_payment_intent_id, trailer_id,
        trailers(name)
      `).order('created_at', { ascending: false });

      const paid = (bookings || []).filter(b => ['confirmed','active','returned'].includes(b.status));
      const sumRev = arr => arr.reduce((s,b) => s + (b.total_amount||0) + (b.late_fee_amount||0), 0);
      const inRange = (arr, fromIso, toIso) => arr.filter(b => b.created_at >= fromIso && (!toIso || b.created_at < toIso));

      const today = inRange(paid, todayStart);
      const thisWeek = inRange(paid, weekStart);
      const lastWeek = inRange(paid, lastWeekStart, weekStart);
      const thisMonth = inRange(paid, monthStart);
      const lastMonth = inRange(paid, lastMonthStart, lastMonthEnd);

      // Anhaenger
      const { data: trailers } = await supabase.from('trailers').select('id, name, type, is_available');
      // Aktive Buchungen (Anhaenger ist gerade draussen)
      const activeBookings = (bookings || []).filter(b => b.status === 'active');
      // Tarif-Verteilung
      const tarifCount = {};
      paid.forEach(b => {
        const t = b.pricing_type || 'unbekannt';
        tarifCount[t] = (tarifCount[t] || 0) + 1;
      });
      // Auslastung pro Anhaenger (vereinfacht: Anzahl Buchungen / Tage seit Verfuegbarkeit)
      const utilByTrailer = {};
      paid.forEach(b => {
        const tid = b.trailer_id || 'unknown';
        utilByTrailer[tid] = (utilByTrailer[tid] || 0) + 1;
      });

      // Anomalien erkennen
      const anomalies = [];
      // 1) Buchung mit Stripe-Fehler (pending > 1h)
      const stalePending = (bookings || []).filter(b =>
        b.status === 'pending' && (Date.now() - new Date(b.created_at).getTime()) > 3600000
      );
      if (stalePending.length > 0) {
        anomalies.push({
          severity: 'red',
          title: `${stalePending.length} Buchung(en) seit >1h "pending"`,
          detail: 'Vermutlich Stripe-Zahlungsfehler. Bitte Mieter manuell kontaktieren.'
        });
      }
      // 2) Anhaenger nicht zurueckgebracht (active + end_time < now - 1h)
      const overdue = activeBookings.filter(b => {
        const end = new Date(b.end_time).getTime();
        return Date.now() > end + 3600000 && !b.actual_return_time;
      });
      if (overdue.length > 0) {
        anomalies.push({
          severity: 'red',
          title: `${overdue.length} Anhaenger ueberfaellig`,
          detail: 'Mietende ist mehr als 1 Stunde vorbei, aber keine Rueckgabe registriert.'
        });
      }
      // 3) Buchungs-Drop diese Woche vs. letzte
      if (lastWeek.length >= 3 && thisWeek.length < lastWeek.length * 0.5) {
        anomalies.push({
          severity: 'yellow',
          title: 'Buchungen diese Woche um >50% gefallen',
          detail: `Letzte Woche: ${lastWeek.length} | Diese Woche: ${thisWeek.length}. Marketing-Kanal pruefen?`
        });
      }
      if (anomalies.length === 0) {
        anomalies.push({ severity: 'green', title: 'Keine Anomalien', detail: 'Alles laeuft im Normalbereich.' });
      }

      // AI-Insights aus DB lesen (Fallback: leer)
      let latestInsight = null;
      try {
        const { data: insights } = await supabase.from('ai_insights')
          .select('*').order('created_at', { ascending: false }).limit(1);
        if (insights && insights[0]) latestInsight = insights[0];
      } catch (e) { /* Tabelle existiert evtl. noch nicht */ }

      return res.status(200).json({
        live: {
          activeBookings: activeBookings.length,
          availableTrailers: (trailers || []).filter(t => t.is_available).length,
          totalTrailers: (trailers || []).length,
        },
        today: { count: today.length, revenue: sumRev(today) },
        thisWeek: { count: thisWeek.length, revenue: sumRev(thisWeek) },
        lastWeek: { count: lastWeek.length, revenue: sumRev(lastWeek) },
        thisMonth: { count: thisMonth.length, revenue: sumRev(thisMonth) },
        lastMonth: { count: lastMonth.length, revenue: sumRev(lastMonth) },
        tarifCount,
        utilByTrailer,
        trailers,
        anomalies,
        aiInsight: latestInsight,
        timestamp: new Date().toISOString(),
      });
    }

    // section === 'data' (default)
    const { data: bookings, error } = await supabase.from('bookings').select(`
      id, customer_name, customer_email, customer_phone,
      start_time, end_time, pricing_type, total_amount,
      status, access_code, actual_return_time,
      late_fee_amount, late_fee_payment_intent_id,
      stripe_payment_intent_id, created_at,
      return_photo_url, precheck_photo_url, insurance_type, insurance_amount,
      trailers(name)
    `).order('created_at', { ascending: false });
    if (error) throw error;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const paid = bookings.filter(b => ['confirmed','active','returned'].includes(b.status));
    const stats = {
      total: bookings.length,
      pending: bookings.filter(b => b.status === 'pending').length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      active: bookings.filter(b => b.status === 'active').length,
      returned: bookings.filter(b => b.status === 'returned').length,
      revenue: paid.reduce((s,b) => s+(b.total_amount||0)+(b.late_fee_amount||0),0),
      revenue_month: paid.filter(b=>b.created_at>=monthStart).reduce((s,b)=>s+(b.total_amount||0)+(b.late_fee_amount||0),0),
      avg_value: paid.length ? paid.reduce((s,b)=>s+(b.total_amount||0),0)/paid.length : 0,
      insurance_revenue: paid.reduce((s,b)=>s+(b.insurance_amount||0),0),
      insurance_basis_count:   paid.filter(b=>b.insurance_type==='basis').length,
      insurance_premium_count: paid.filter(b=>b.insurance_type==='premium').length,
      insurance_none_count:    paid.filter(b=>!b.insurance_type||b.insurance_type==='none').length,
    };
    return res.status(200).json({ bookings, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
