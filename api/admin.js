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

    if (section === 'daily-briefing') {
      // Aggregierte Tagesplan-Daten — gleicher Code wie /api/cron/daily-briefing aber als JSON
      const items = [];
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

      try {
        const { data: stalePending } = await supabase.from('bookings')
          .select('id, customer_name, total_amount').eq('status', 'pending').lt('created_at', oneHourAgo);
        if ((stalePending || []).length > 0) {
          items.push({ severity: 'red', icon: '🔴', title: `${stalePending.length} Buchung(en) seit >1h pending`, detail: 'Vermutlich Stripe-Fehler — manuell nachfassen.' });
        }
      } catch (e) {}

      try {
        const { data: actives } = await supabase.from('bookings')
          .select('id, customer_name, end_time, actual_return_time').eq('status', 'active');
        const overdue = (actives || []).filter(b => {
          const end = new Date(b.end_time).getTime();
          return Date.now() > end + 3600000 && !b.actual_return_time;
        });
        if (overdue.length > 0) {
          items.push({ severity: 'red', icon: '🔴', title: `${overdue.length} Anhänger überfällig`, detail: 'Mietende > 1h vorbei, keine Rückgabe.' });
        }
      } catch (e) {}

      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: posts } = await supabase.from('social_posts_queue')
          .select('id, topic_type').eq('scheduled_for', today).eq('status', 'draft').limit(1);
        if (posts && posts[0]) {
          items.push({ severity: 'yellow', icon: '📱', title: `Insta-Post für heute genehmigen + posten`, detail: `Topic: ${posts[0].topic_type} · Caption + Bild-Idee bereit.` });
        }
      } catch (e) {}

      try {
        const { data: drafts } = await supabase.from('content_drafts')
          .select('id, type, title').eq('status', 'draft').limit(3);
        if ((drafts || []).length > 0) {
          items.push({ severity: 'yellow', icon: '📝', title: `${drafts.length} Content-Draft${drafts.length>1?'s':''} wartet`, detail: drafts.map(d => `${d.type}: "${d.title}"`).join(' · ') });
        }
      } catch (e) {}

      // TÜV / Wartung — fällig in ≤ 7 Tagen (oder bereits überfällig) → red
      try {
        const { data: trailers } = await supabase.from('trailers')
          .select('name, next_tuev_date, next_maintenance_date');
        const today = new Date(); today.setHours(0,0,0,0);
        const inDays = (d) => Math.ceil((new Date(d + 'T12:00:00') - today) / 86400000);
        const overdueOrSoon = [];
        for (const t of (trailers || [])) {
          if (t.next_tuev_date) {
            const d = inDays(t.next_tuev_date);
            if (d <= 7) overdueOrSoon.push({ name: t.name, kind: 'TÜV', days: d });
          }
          if (t.next_maintenance_date) {
            const d = inDays(t.next_maintenance_date);
            if (d <= 7) overdueOrSoon.push({ name: t.name, kind: 'Wartung', days: d });
          }
        }
        if (overdueOrSoon.length > 0) {
          const detail = overdueOrSoon
            .map(o => `${o.kind} "${o.name}": ${o.days < 0 ? `vor ${Math.abs(o.days)}T überfällig` : (o.days === 0 ? 'HEUTE!' : `in ${o.days} Tag${o.days===1?'':'en'}`)}`)
            .join(' · ');
          items.push({
            severity: 'red',
            icon: '🔧',
            title: `${overdueOrSoon.length} TÜV/Wartung in ≤ 7 Tagen`,
            detail,
          });
        }
      } catch (e) {}

      // Bremen-Zulassungs-Termin: aktueller frühester Termin (info)
      try {
        const { data: watcher } = await supabase.from('termin_watcher_state')
          .select('bremen_termin_deadline, last_earliest_date')
          .eq('id', 1)
          .maybeSingle();
        if (watcher?.bremen_termin_deadline && watcher?.last_earliest_date) {
          const deadline = new Date(watcher.bremen_termin_deadline + 'T12:00:00');
          const earliest = new Date(watcher.last_earliest_date + 'T12:00:00');
          if (earliest < deadline) {
            const fmt = (d) => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
            items.push({
              severity: 'red',
              icon: '🚨',
              title: `Früherer Bremen-Termin verfügbar: ${fmt(earliest)}`,
              detail: `Dein gebuchter Termin ist ${fmt(deadline)} — bei service.bremen.de buchen!`,
            });
          }
        }
      } catch (e) {}

      if (items.length === 0) {
        items.push({ severity: 'green', icon: '🟢', title: 'Alles ruhig', detail: 'Keine Anomalien, keine offenen Tasks.' });
      }

      const order = { red: 0, yellow: 1, info: 2, green: 3 };
      items.sort((a,b) => order[a.severity] - order[b.severity]);

      return res.status(200).json({ items, generated_at: new Date().toISOString() });
    }

    if (section === 'content-drafts') {
      try {
        const { data } = await supabase.from('content_drafts').select('*').order('created_at', { ascending: false }).limit(20);
        return res.status(200).json({ drafts: data || [] });
      } catch (e) {
        return res.status(200).json({ drafts: [], error: 'content_drafts table missing' });
      }
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

    // ─── AI-INBOX: alle pending Items aggregiert ───
    if (section === 'ai-inbox') {
      const [drafts, posts, insights] = await Promise.all([
        supabase.from('content_drafts').select('id,type,title,slug,meta_description,status,created_at').eq('status', 'draft').order('created_at', { ascending: false }).limit(20).then(r => r.data || []).catch(() => []),
        supabase.from('social_posts_queue').select('id,scheduled_for,topic_type,caption,hashtags,image_prompt,status').eq('status', 'draft').order('scheduled_for', { ascending: true }).limit(20).then(r => r.data || []).catch(() => []),
        supabase.from('ai_insights').select('id,type,recommendation,agent_name,question,created_at,acknowledged_at').is('acknowledged_at', null).order('created_at', { ascending: false }).limit(15).then(r => r.data || []).catch(() => []),
      ]);

      const items = [
        ...drafts.map(d => ({ kind: 'content-draft', id: d.id, title: d.title, summary: (d.meta_description || '').slice(0, 200), type: d.type, created_at: d.created_at })),
        ...posts.map(p => ({ kind: 'social-post', id: p.id, title: `${p.topic_type} · ${p.scheduled_for}`, summary: p.caption.slice(0, 200), caption: p.caption, hashtags: p.hashtags, image_prompt: p.image_prompt, scheduled_for: p.scheduled_for, created_at: p.scheduled_for })),
        ...insights.map(i => ({ kind: 'ai-insight', id: i.id, title: i.type === 'direct-ask' ? `Antwort von ${i.agent_name}: ${i.question?.slice(0, 60)}` : (i.type || 'Insight'), summary: i.recommendation.replace(/<[^>]+>/g, '').slice(0, 250), recommendation: i.recommendation, agent_name: i.agent_name, type: i.type, created_at: i.created_at })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return res.status(200).json({
        items,
        counts: { drafts: drafts.length, posts: posts.length, insights: insights.length, total: items.length },
      });
    }

    // ─── INBOX-ACTION: approve/reject/edit/acknowledge ───
    if (section === 'inbox-action' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { kind, id, action, payload } = body;
      if (!kind || !id || !action) return res.status(400).json({ error: 'kind+id+action required' });

      try {
        if (kind === 'content-draft') {
          const newStatus = action === 'approve' ? 'approved' : (action === 'reject' ? 'rejected' : null);
          if (action === 'edit' && payload) {
            await supabase.from('content_drafts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
          } else if (newStatus) {
            await supabase.from('content_drafts').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
          }
        } else if (kind === 'social-post') {
          if (action === 'approve' || action === 'mark-posted') {
            await supabase.from('social_posts_queue').update({ status: 'posted', posted_at: new Date().toISOString(), posted_by: 'manual' }).eq('id', id);
          } else if (action === 'reject' || action === 'skip') {
            await supabase.from('social_posts_queue').update({ status: 'skipped' }).eq('id', id);
          } else if (action === 'edit' && payload) {
            await supabase.from('social_posts_queue').update(payload).eq('id', id);
          }
        } else if (kind === 'ai-insight') {
          // Acknowledge = wegklicken (nicht löschen, aber aus Inbox raus)
          await supabase.from('ai_insights').update({ acknowledged_at: new Date().toISOString() }).eq('id', id);
        }
        return res.status(200).json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ─── DIRECT-ASK: User stellt Live-Frage an einen Agent ───
    // Backward-compatible: { agent, question }  ODER  { agent, messages: [...] }
    // messages = [{ role: 'user'|'assistant', content: '...' }, ...]  (mit letzter user-Frage)
    if (section === 'direct-ask' && req.method === 'POST') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { agent, question, messages } = body;
      if (!agent) return res.status(400).json({ error: 'agent required' });

      // Eingabe normalisieren → conv (Anthropic-format messages)
      let conv;
      if (Array.isArray(messages) && messages.length > 0) {
        conv = messages
          .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
          .map(m => ({ role: m.role, content: m.content }));
        // Letzter Eintrag MUSS user sein (sonst hat Agent nichts zu beantworten)
        if (!conv.length || conv[conv.length - 1].role !== 'user') {
          return res.status(400).json({ error: 'letzte Message muss role=user sein' });
        }
        // Sicherheits-Cap: max ~20 turns (vermeidet Token-Bombe)
        if (conv.length > 20) conv = conv.slice(-20);
      } else if (typeof question === 'string' && question.trim()) {
        conv = [{ role: 'user', content: question }];
      } else {
        return res.status(400).json({ error: 'question oder messages required' });
      }

      const AGENT_PROMPTS = require('./_agent-prompts.js');
      const systemPrompt = AGENT_PROMPTS[agent];
      if (!systemPrompt) return res.status(404).json({ error: `Agent '${agent}' nicht verfuegbar` });

      // Inter-Agent: letzte 3 Insights als Cross-Context
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recent } = await supabase.from('ai_insights')
        .select('type, recommendation, created_at')
        .gte('created_at', sevenDaysAgo)
        .neq('type', 'direct-ask')
        .order('created_at', { ascending: false })
        .limit(3);

      const crossContext = (recent || []).length > 0
        ? `\n\n# Aktueller System-Kontext (andere Agent-Insights letzte 7 Tage):\n${recent.map(r => `- ${r.type}: ${r.recommendation.replace(/<[^>]+>/g, '').slice(0, 300)}`).join('\n')}`
        : '';

      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2500,
            system: systemPrompt + crossContext,
            messages: conv,
          }),
        });
        if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const data = await r.json();
        const answer = data.content?.[0]?.text || '';

        // Nur die ERSTE Frage einer Konversation in Inbox speichern
        // (sonst landet jede Folge-Frage als eigener Eintrag und überflutet die Inbox)
        const isFollowUp = conv.length > 1;
        if (!isFollowUp) {
          await supabase.from('ai_insights').insert({
            type: 'direct-ask',
            agent_name: agent,
            question: conv[conv.length - 1].content,
            recommendation: answer,
          });
        }

        return res.status(200).json({ ok: true, answer, agent });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ─── WATCHER-CONFIG: Bremen-Termin-Deadline lesen/setzen ───
    if (section === 'watcher-config') {
      if (req.method === 'GET') {
        try {
          const { data } = await supabase
            .from('termin_watcher_state')
            .select('bremen_termin_deadline, last_earliest_date, last_check_at, last_pushed_date')
            .eq('id', 1)
            .maybeSingle();
          return res.status(200).json({
            bremen_termin_deadline: data?.bremen_termin_deadline || null,
            last_earliest_date:     data?.last_earliest_date     || null,
            last_check_at:          data?.last_check_at          || null,
            last_pushed_date:       data?.last_pushed_date       || null,
          });
        } catch (e) {
          return res.status(200).json({
            bremen_termin_deadline: null,
            error: 'Spalte fehlt — Migration supabase-migration-bremen-deadline.sql noch nicht ausgeführt',
          });
        }
      }
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const { bremen_termin_deadline } = body;
        if (bremen_termin_deadline !== undefined && bremen_termin_deadline !== null && bremen_termin_deadline !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(bremen_termin_deadline)) {
          return res.status(400).json({ error: 'bremen_termin_deadline muss YYYY-MM-DD sein' });
        }
        const { error } = await supabase
          .from('termin_watcher_state')
          .upsert({ id: 1, bremen_termin_deadline: bremen_termin_deadline || null }, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true });
      }
    }

    // ─── UPDATE-TRAILER-DATES: TÜV/Wartung pro Anhänger setzen ───
    if (section === 'update-trailer-dates' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { trailer_id, next_tuev_date, next_maintenance_date } = body;
      if (!trailer_id) return res.status(400).json({ error: 'trailer_id required' });

      const updates = {};
      if (next_tuev_date !== undefined) updates.next_tuev_date = next_tuev_date || null;
      if (next_maintenance_date !== undefined) updates.next_maintenance_date = next_maintenance_date || null;

      const { error } = await supabase.from('trailers').update(updates).eq('id', trailer_id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // ─── TRAILERS: Liste mit TÜV/Wartung-Daten ───
    if (section === 'trailers') {
      const { data } = await supabase.from('trailers').select('id, name, type, is_available, next_tuev_date, next_maintenance_date');
      return res.status(200).json({ trailers: data || [] });
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
