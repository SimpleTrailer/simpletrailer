const { createClient } = require('@supabase/supabase-js');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Admin-Whitelist — nur diese Mails dürfen den Endpoint nutzen.
// Override per ENV ADMIN_EMAILS (Komma-getrennt) — sonst Default.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'admin@simpletrailer.de,info@simpletrailer.de,lion@simpletrailer.de')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const { setCors } = require('./_cors');
const T = require('./_email-template');

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });
  const token = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Ungültiger Token' });
  // 🔐 Admin-Whitelist: nur konfigurierte Mails — schützt vor Datenleak durch normale Kunden.
  if (!ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'Forbidden — kein Admin-Zugang' });
  }

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
      const users = usersData.users
        .filter(u => !ADMIN_EMAILS.includes((u.email || '').toLowerCase()))  // Team-/Admin-Konten nicht als Kunden/Leads zählen
        .map(u => ({
        id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
        first_name: u.user_metadata?.first_name || '', last_name: u.user_metadata?.last_name || '',
        phone: u.user_metadata?.phone || '', confirmed: !!u.email_confirmed_at,
        address: u.user_metadata?.address || '', birthdate: u.user_metadata?.birthdate || null,
        dl_address: u.user_metadata?.dl_address || null, dl_manual: !!u.user_metadata?.dl_manual,
        dl_manual_by: u.user_metadata?.dl_manual_by || null, dl_prev_failure_reason: u.user_metadata?.dl_prev_failure_reason || null,
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
        dl_stripe_session_id: u.user_metadata?.dl_stripe_session_id || null,
        dl_failure_reason: u.user_metadata?.dl_failure_reason || null,
      })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // "Benachrichtigen wenn da"-Anmeldungen — warme Leads für noch nicht verfügbare Anhänger
      let notify = [];
      try {
        const { data: nd, error: notifyError } = await supabase
          .from('notify_when_available')
          .select('email, trailer_type, notified, created_at')
          .order('created_at', { ascending: false });
        if (notifyError) console.warn('[admin] notify_when_available nicht lesbar:', notifyError.message);
        else notify = nd || [];
      } catch (e) { console.warn('[admin] notify_when_available Query-Exception:', e.message); }

      return res.status(200).json({ users, notify });
    }

    // Test-/Karteileichen-Nutzer löschen — MIT SCHUTZ vor echten Kunden.
    if (section === 'delete-user' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const userId = body.user_id;
      if (!userId || !/^[0-9a-f-]{36}$/i.test(String(userId))) return res.status(400).json({ error: 'Ungültige user_id.' });

      // Ziel-User holen (Email + Existenz)
      const { data: tgt, error: getErr } = await supabase.auth.admin.getUserById(userId);
      if (getErr || !tgt?.user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
      const targetEmail = (tgt.user.email || '').toLowerCase();

      // Admin-Konten niemals löschbar
      if (ADMIN_EMAILS.includes(targetEmail)) return res.status(403).json({ error: 'Admin-Konten können nicht gelöscht werden.' });

      // 🔒 SCHUTZ: keine aufbewahrungspflichtigen Buchungen löschen (§147 AO, §14b UStG).
      // Robust über customer_email (garantierte Spalte) + JS-Filter — keine Annahme über bookings.user_id.
      const { data: userBookings, error: bErr } = await supabase.from('bookings')
        .select('id, status, stripe_payment_intent_id').eq('customer_email', targetEmail);
      if (bErr) throw bErr;
      const hasRealBooking = (userBookings || []).some(b =>
        ['confirmed', 'active', 'returned'].includes(b.status) ||
        (b.status === 'cancelled' && b.stripe_payment_intent_id));
      if (hasRealBooking) {
        return res.status(409).json({ error: 'Benutzer hat echte/bezahlte Buchungen — Löschen gesperrt (Aufbewahrungspflicht). Nur Test-/Karteileichen löschbar.' });
      }

      // Aufräumen: Test-/Pending-Buchungen ZUERST und HART — kein Konto-Löschen bei Cleanup-Fehler (keine Waisen).
      const { error: delBookErr } = await supabase.from('bookings').delete().eq('customer_email', targetEmail);
      if (delBookErr) return res.status(500).json({ error: 'Buchungs-Cleanup fehlgeschlagen, Konto NICHT gelöscht: ' + delBookErr.message });
      try { await supabase.from('push_tokens').delete().eq('user_id', userId); } catch (e) {}
      try { await supabase.from('notify_when_available').delete().eq('email', targetEmail); } catch (e) {}

      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) return res.status(500).json({ error: 'Konto-Löschen fehlgeschlagen: ' + delErr.message });

      return res.status(200).json({ ok: true });
    }

    // Führerschein MANUELL als verifiziert markieren (Admin-Sicht-Prüfung, z.B. ausländische Scheine).
    if (section === 'verify-user-manual' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const userId = body.user_id;
      if (!userId || !/^[0-9a-f-]{36}$/i.test(String(userId))) return res.status(400).json({ error: 'Ungültige user_id.' });
      const { data: tgt, error: getErr } = await supabase.auth.admin.getUserById(userId);
      if (getErr || !tgt?.user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
      const meta = { ...(tgt.user.user_metadata || {}) };
      meta.dl_prev_failure_reason = meta.dl_failure_reason || meta.dl_prev_failure_reason || null;  // Original-Stripe-Grund aufbewahren (Audit)
      meta.dl_status = 'verified';
      meta.dl_verified_at = new Date().toISOString();
      meta.dl_manual = true;
      meta.dl_manual_by = (user.email || '').toLowerCase();  // welcher Admin hat freigeschaltet
      meta.dl_classes = (Array.isArray(meta.dl_classes) && meta.dl_classes.includes('B')) ? meta.dl_classes : [...new Set([...(meta.dl_classes || []), 'B'])];
      meta.dl_failure_reason = null;
      const { error: upErr } = await supabase.auth.admin.updateUserById(userId, { user_metadata: meta });
      if (upErr) return res.status(500).json({ error: 'Speichern fehlgeschlagen: ' + upErr.message });
      return res.status(200).json({ ok: true });
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

      // Offene Forderungen: Verspätungsgebühr fällig, aber Auto-Abbuchung fehlgeschlagen (manuell einziehen!)
      try {
        const { data: feeBookings } = await supabase.from('bookings')
          .select('id, late_fee_amount, late_fee_payment_intent_id').gt('late_fee_amount', 0);
        const claims = (feeBookings || []).filter(b => !b.late_fee_payment_intent_id || String(b.late_fee_payment_intent_id).startsWith('FAILED'));
        if (claims.length > 0) {
          const sum = claims.reduce((s, c) => s + (c.late_fee_amount || 0), 0);
          items.push({ severity: 'red', icon: '💸', title: `${claims.length} offene Forderung(en): ${sum.toFixed(2)} € nicht eingezogen`, detail: 'Verspätung/Schaden — Auto-Abbuchung fehlgeschlagen. Manuell per Stripe-Payment-Link einziehen.' });
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

    // === AGENT-INBOX (Routine-Reports der 6 Crons im Cockpit) ===
    if (section === 'agent-inbox') {
      const onlyUnread = req.query.filter === 'unread';
      try {
        let query = supabase.from('agent_messages')
          .select('id, agent_name, severity, title, summary, body_html, read_at, created_at')
          .order('created_at', { ascending: false })
          .limit(50);
        if (onlyUnread) query = query.is('read_at', null);
        const { data, error: err } = await query;
        if (err) throw err;
        const { count: unreadCount } = await supabase.from('agent_messages')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null);
        return res.status(200).json({ messages: data || [], unread: unreadCount || 0 });
      } catch (e) {
        if (/relation .* does not exist/i.test(e.message || '')) {
          return res.status(200).json({ messages: [], unread: 0, warning: 'agent_messages table missing — supabase-migration-agent-inbox.sql ausführen.' });
        }
        return res.status(500).json({ error: e.message });
      }
    }

    if (section === 'inbox-mark-read' && req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const ids = Array.isArray(body?.ids) ? body.ids : (body?.id ? [body.id] : []);
      const all = body?.all === true;
      try {
        let q = supabase.from('agent_messages').update({ read_at: new Date().toISOString() });
        if (all) q = q.is('read_at', null);
        else if (ids.length) q = q.in('id', ids);
        else return res.status(400).json({ error: 'ids oder all=true erforderlich' });
        const { error: err } = await q;
        if (err) throw err;
        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
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

    // ─── UPDATE-TRAILER-DATES: TÜV/Wartung pro Anhänger setzen (Legacy-Endpoint, bleibt aktiv) ───
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

    // ─── UPDATE-TRAILER: Vollständige Flotten-Daten (Code, TÜV, Kennzeichen, etc.) ───
    if (section === 'update-trailer' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { trailer_id } = body;
      if (!trailer_id) return res.status(400).json({ error: 'trailer_id required' });

      // Whitelist der bearbeitbaren Felder — verhindert ungewollte Spalten-Updates
      const ALLOWED = [
        'access_code', 'license_plate', 'chassis_number',
        'insurance_until', 'purchase_date', 'internal_notes',
        'next_tuev_date', 'next_maintenance_date',
        'is_available'
      ];
      const updates = {};
      for (const k of ALLOWED) {
        if (body[k] === undefined) continue;
        // Leerer String → NULL (sauberer in DB als '')
        updates[k] = (body[k] === '' || body[k] === null) ? null : body[k];
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'Keine Felder zum Updaten' });
      }

      const { error } = await supabase.from('trailers').update(updates).eq('id', trailer_id);
      if (error) {
        // Wenn Spalte fehlt → Migration noch nicht gelaufen
        if (/column .* does not exist/i.test(error.message || '')) {
          return res.status(500).json({
            error: 'DB-Spalte fehlt — bitte supabase-migration-trailer-fleet.sql ausführen.',
            detail: error.message
          });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ ok: true, updated: Object.keys(updates) });
    }

    // ─── DAMAGES: Schadenshistorie pro Trailer + Refund-Pending-Buchungen ───
    if (section === 'damages') {
      const trailerId = req.query.trailer_id;
      let q = supabase.from('damages')
        .select('id, trailer_id, booking_id, source, severity, description, photo_url, status, resolved_at, resolved_note, reported_by, created_at')
        .order('created_at', { ascending: false }).limit(200);
      if (trailerId) q = q.eq('trailer_id', trailerId);
      const { data: damages } = await q;
      return res.status(200).json({ damages: damages || [] });
    }

    // ─── REFUND-PENDING: Buchungen die nicht-fahrtauglich gemeldet wurden ───
    if (section === 'refund-pending') {
      const { data } = await supabase.from('bookings')
        .select('id, customer_name, customer_email, trailer_id, total_amount, start_time, not_drivable_reported_at, not_drivable_photo_url, not_drivable_description, refund_status, stripe_payment_intent_id, trailers(name)')
        .eq('refund_status', 'pending')
        .order('not_drivable_reported_at', { ascending: false });
      return res.status(200).json({ bookings: data || [] });
    }

    // ─── APPROVE-REFUND: Admin gibt den Refund frei ───
    if (section === 'approve-refund' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { booking_id, action } = body;  // action: 'approve' | 'reject'
      if (!booking_id) return res.status(400).json({ error: 'booking_id erforderlich' });
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action muss approve/reject sein' });

      const { data: booking } = await supabase.from('bookings').select('*, trailers(name)').eq('id', booking_id).maybeSingle();
      if (!booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });

      if (action === 'approve') {
        // Stripe-Refund
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        let refundId = null;
        if (booking.stripe_payment_intent_id) {
          try {
            const refund = await stripe.refunds.create({
              payment_intent: booking.stripe_payment_intent_id,
              reason: 'requested_by_customer',
              metadata: { booking_id: booking.id, reason: 'not_drivable_approved' }
            }, { idempotencyKey: `refund-${booking.id}` });
            refundId = refund.id;
          } catch (e) {
            return res.status(500).json({ error: 'Stripe-Refund fehlgeschlagen: ' + e.message });
          }
        }
        await supabase.from('bookings').update({
          refund_status: 'approved',
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_refund_amount: booking.total_amount,
          cancellation_refund_id: refundId
        }).eq('id', booking.id);

        // Mieter informieren
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        try {
          await resend.emails.send({
            from: 'SimpleTrailer <buchung@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: booking.customer_email,
            subject: `Erstattung freigegeben — Buchung #${booking.id.slice(0,8).toUpperCase()}`,
            text: `Hi ${booking.customer_name},

deine Schadens-Meldung wurde geprüft und bestätigt. Die volle Erstattung
in Höhe von ${booking.total_amount.toFixed(2).replace('.', ',')} € wird auf
deine Zahlungsmethode zurückgebucht (3-5 Werktage).

Wir bitten den Ausfall zu entschuldigen.

— SimpleTrailer GbR`
          });
        } catch (e) { console.error('Approve-Mail fail:', e.message); }
        return res.status(200).json({ ok: true, refund_id: refundId });
      } else {
        // Ablehnen — Status auf rejected, Buchung bleibt
        await supabase.from('bookings').update({ refund_status: 'rejected' }).eq('id', booking.id);
        return res.status(200).json({ ok: true });
      }
    }

    // ─── CANCEL-BOOKING: Admin storniert eine Buchung (Refund + Slot frei + Mail) ───
    if (section === 'cancel-booking' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { booking_id } = body;
      if (!booking_id) return res.status(400).json({ error: 'booking_id erforderlich' });

      const { data: booking } = await supabase.from('bookings').select('*, trailers(name)').eq('id', booking_id).maybeSingle();
      if (!booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
      if (booking.status === 'cancelled') return res.status(200).json({ ok: true, already_cancelled: true });

      // Atomarer Lock (gleiche Spalte wie der Mieter-Storno api/cancel-booking.js) →
      // verhindert Doppel-Refund bei parallelem Mieter+Admin-Storno: nur EIN Request gewinnt.
      const { data: locked } = await supabase
        .from('bookings')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', booking.id)
        .is('cancelled_at', null)
        .select('id')
        .maybeSingle();
      if (!locked) return res.status(409).json({ error: 'Stornierung läuft bereits oder ist abgeschlossen.' });

      const totalPaid = Number(booking.total_amount || 0);

      // Buchung ohne hinterlegte Zahlung: nicht still als "erstattet" markieren — Lock lösen + abbrechen.
      if (totalPaid > 0 && !booking.stripe_payment_intent_id) {
        await supabase.from('bookings').update({ cancelled_at: null }).eq('id', booking.id);
        return res.status(400).json({ error: 'Buchung ohne hinterlegte Zahlung — bitte manuell im Stripe-Dashboard erstatten.' });
      }

      // Voller Refund — robust: nur den NOCH NICHT erstatteten Rest zurückzahlen
      // (falls der Mieter z.B. schon einen Teil-Refund erhalten hat → Aufstockung auf 100 %).
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      let refundId = booking.cancellation_refund_id || null;
      let refundedAmount = 0;
      if (booking.stripe_payment_intent_id) {
        try {
          const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id, { expand: ['latest_charge'] });
          const ch = pi.latest_charge;
          const chargedCents = ch ? (ch.amount || 0) : 0;
          const alreadyCents = ch ? (ch.amount_refunded || 0) : 0;
          const remainingCents = Math.max(0, chargedCents - alreadyCents);
          if (remainingCents > 0) {
            const refund = await stripe.refunds.create({
              payment_intent: booking.stripe_payment_intent_id,
              amount: remainingCents,
              reason: 'requested_by_customer',
              metadata: { booking_id: booking.id, reason: 'admin_cancellation' }
            }, { idempotencyKey: `cancel-${booking.id}-${remainingCents}` });
            refundId = refund.id;
          }
          refundedAmount = (alreadyCents + remainingCents) / 100;
        } catch (e) {
          await supabase.from('bookings').update({ cancelled_at: null }).eq('id', booking.id);
          console.error('Admin-Cancel Stripe-Refund-Fehler', { code: e.code, type: e.type, booking_id: booking.id });
          return res.status(500).json({ error: 'Stripe-Refund fehlgeschlagen — bitte Stripe-Dashboard prüfen.' });
        }
      }

      const { error: finalErr } = await supabase.from('bookings').update({
        status: 'cancelled',
        cancellation_refund_amount: refundedAmount,
        cancellation_refund_id: refundId,
        refund_status: 'approved'
      }).eq('id', booking.id);
      if (finalErr) console.error('CRITICAL: admin-cancel final status update failed', { booking_id: booking.id, refund_id: refundId, err: finalErr.message });

      // Mieter informieren
      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const num = booking.id.slice(0, 8).toUpperCase();
        await resend.emails.send({
          from: 'SimpleTrailer <buchung@simpletrailer.de>',
          reply_to: 'info@simpletrailer.de',
          to: booking.customer_email,
          subject: `Buchung storniert — #${num}`,
          text: `Hi ${booking.customer_name || ''},

deine Buchung (#${num}) wurde storniert.${refundedAmount > 0 ? `
Erstattung: ${refundedAmount.toFixed(2).replace('.', ',')} € — automatisch über deine Zahlungsmethode (3-5 Werktage).` : ''}

Bei Fragen sind wir unter info@simpletrailer.de gerne für dich da.

— SimpleTrailer GbR`,
          html: T.layout({
            heading: 'Buchung storniert',
            preheader: `Buchung #${num} wurde storniert`,
            replyNote: 'Fragen? Antworte auf diese Mail oder schreib an info@simpletrailer.de.',
            bodyHtml:
              T.p(`Buchung <strong>#${num}</strong> · ${T.esc(booking.trailers?.name || 'Anhänger')}`) +
              T.rows([
                ['Gezahlt', `${totalPaid.toFixed(2).replace('.', ',')} €`],
                ['Erstattung', refundedAmount > 0 ? `<span style="color:#15803D;font-weight:700;">${refundedAmount.toFixed(2).replace('.', ',')} €</span>` : 'Keine']
              ]) +
              (refundedAmount > 0 ? T.callout('Die Erstattung wird automatisch auf deine Zahlungsmethode zurückgebucht (3–5 Werktage).', 'green') : '')
          })
        });
      } catch (e) { console.error('Storno-Mail fail:', e.message); }

      return res.status(200).json({ ok: true, refund_id: refundId, amount: refundedAmount });
    }

    // ─── SEND-CUSTOMER-MAIL: Einzel-Mail an einen Kunden (z. B. Kulanz) — hell via Resend ───
    if (section === 'send-customer-mail' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { booking_id, to } = body;
      let recipient, num, vorname;
      if (to) {                                    // Test-/Direkt-Versand an feste Adresse
        recipient = String(to).trim();
        if (!recipient.includes('@')) return res.status(400).json({ error: 'Ungültige Adresse' });
        num = 'TEST'; vorname = '';
      } else {
        if (!booking_id) return res.status(400).json({ error: 'booking_id oder to erforderlich' });
        const { data: b } = await supabase.from('bookings').select('id, customer_email, customer_name').eq('id', booking_id).maybeSingle();
        if (!b || !b.customer_email) return res.status(404).json({ error: 'Buchung/E-Mail nicht gefunden' });
        recipient = b.customer_email;
        num = b.id.slice(0, 8).toUpperCase();
        vorname = String(b.customer_name || '').split(' ')[0];
      }

      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      const html = T.layout({
        heading: 'Alles gut 🙂',
        preheader: 'Wir drücken bei der Verspätung ein Auge zu.',
        replyNote: 'Bis zur nächsten Fahrt! Liebe Grüße, Lion &amp; Samuel',
        bodyHtml:
          T.p(`Hallo${vorname ? ' ' + T.esc(vorname) : ''},`) +
          T.p('danke, dass du den Anhänger bei uns gemietet hast!') +
          T.p('Wir haben versucht, dich <strong>telefonisch zu erreichen</strong> — das hat leider nicht geklappt. Daher kurz auf diesem Weg:') +
          T.p('Die Rückgabe war ein paar Minuten nach Mietende — laut AGB würde dafür eine kleine Verspätungsgebühr anfallen. Bei den paar Minuten drücken wir aber gerne ein Auge zu: <strong>Für dich fällt nichts an.</strong> 🙂') +
          T.p('Wenn alles gepasst hat, freuen wir uns riesig über eine kurze Google-Bewertung — das hilft uns als jungem Bremer Team enorm:') +
          T.cta(T.btn('Auf Google bewerten →', 'https://g.page/r/Cd6jwKdwS_Y7EAE/review'))
      });
      try {
        await resend.emails.send({
          from: 'SimpleTrailer <info@simpletrailer.de>',
          reply_to: 'info@simpletrailer.de',
          to: recipient,
          subject: `Deine Buchung #${num} – alles gut 🙂`,
          html
        });
      } catch (e) {
        console.error('send-customer-mail fail:', e.message);
        return res.status(500).json({ error: 'Mail-Versand fehlgeschlagen: ' + e.message });
      }
      return res.status(200).json({ ok: true, to: recipient });
    }

    // ─── SEND-WINBACK: Rückhol-Mail an offene Leads — jeder bekommt EINE eigene Mail (kein CC) ───
    if (section === 'send-winback' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const esc = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

      const winbackHtml = (vorname) => T.layout({
        heading: 'Du warst nur einen Schritt entfernt.',
        preheader: 'Deine Buchung ist in 2 Minuten fertig – plus 20 % für dich.',
        replyNote: 'Liebe Grüße, Lion &amp; Samuel · SimpleTrailer',
        bodyHtml:
          T.p(`Hallo${vorname ? ' ' + T.esc(vorname) : ''},<br>du hast dir bei SimpleTrailer ein Konto angelegt, deine Buchung aber noch nicht abgeschlossen. Schade – der Rest ist in <strong>2 Minuten</strong> erledigt.`) +
          T.p('Damit sich dein erster Anhänger besonders lohnt, schenken wir dir <strong>20 %</strong>.') +
          T.voucher({ headline: 'Dein Willkommens-Rabatt', big: '20 % Rabatt', code: 'WILLKOMMEN20', validity: 'Gültig bis 25.06.2026 · Code im Checkout eingeben' }) +
          T.p('<strong>So löst du ihn ein:</strong> Buch wie gewohnt auf simpletrailer.de und gib im Zahlungs-Schritt den Code <strong>WILLKOMMEN20</strong> ein – die 20 % werden direkt abgezogen.') +
          T.cta(T.btn('Jetzt mit 20 % buchen →', 'https://simpletrailer.de/booking'))
      });

      const winbackText = (vorname) => `Hallo${vorname ? ' ' + vorname : ''},

du hast dir bei SimpleTrailer ein Konto angelegt, deine Buchung aber noch nicht abgeschlossen. Schade – der Rest ist in 2 Minuten erledigt.

Damit sich dein erster Anhänger besonders lohnt, schenken wir dir 20 %.

Als Dankeschön: 20 % Rabatt auf deine Buchung. Code: WILLKOMMEN20 (gültig bis 25.06.2026).
So einlösen: Buch wie gewohnt auf simpletrailer.de und gib im Zahlungs-Schritt den Code ein – die 20 % werden direkt abgezogen.

Jetzt buchen: https://simpletrailer.de/booking

Liebe Grüße,
Lion & Samuel · SimpleTrailer
SimpleTrailer GbR · Waltjenstr. 96, 28237 Bremen · info@simpletrailer.de`;

      // Vorschau: rendert die Mail ohne zu senden (Admin-Check vor dem Versand)
      if (body.preview) {
        return res.status(200).json({ subject: 'Dein Anhänger wartet – 20 % Willkommensrabatt für dich', html: winbackHtml(String(body.sample_name || '').trim()) });
      }

      const recipients = Array.isArray(body.recipients) ? body.recipients : [];
      if (!recipients.length) return res.status(400).json({ error: 'Keine Empfänger übergeben' });

      let sent = 0, skipped = 0, failed = 0;
      for (const r of recipients.slice(0, 300)) {
        const email = String(r.email || '').trim().toLowerCase();
        if (!email || !email.includes('@') || !email.includes('.')) { failed++; continue; }

        // Doppel-Sende-Schutz: schon angeschrieben? + bestehende Metadaten für das Update holen
        let existingMeta = {};
        if (r.user_id) {
          try {
            const { data: { user: u } } = await supabase.auth.admin.getUserById(r.user_id);
            existingMeta = u?.user_metadata || {};
            if (existingMeta.winback_sent_at) { skipped++; continue; }
          } catch (e) {}
        }

        const vorname = String(r.first_name || '').trim();
        try {
          await resend.emails.send({
            from: 'SimpleTrailer <info@simpletrailer.de>',
            reply_to: 'info@simpletrailer.de',
            to: email,
            subject: 'Dein Anhänger wartet – 20 % Willkommensrabatt für dich',
            html: winbackHtml(vorname),
            text: winbackText(vorname)
          });
          sent++;
          if (r.user_id) {
            try { await supabase.auth.admin.updateUserById(r.user_id, { user_metadata: { ...existingMeta, winback_sent_at: new Date().toISOString() } }); } catch (e) {}
          }
        } catch (e) {
          console.error('Winback-Mail fail:', email, e.message);
          failed++;
        }
      }
      return res.status(200).json({ sent, skipped, failed });
    }

    // ─── TRAILERS: Vollständige Liste mit allen Flotten-Daten ───
    if (section === 'trailers') {
      // Versuche das ganze Set — bei fehlenden Spalten fallback auf Basis-Liste
      let data, error;
      try {
        const r = await supabase.from('trailers').select(
          'id, name, type, is_available, image_url, access_code, license_plate, chassis_number, ' +
          'next_tuev_date, next_maintenance_date, insurance_until, purchase_date, internal_notes, ' +
          'price_3h, price_day, price_weekend, late_fee_per_hour, ' +
          'last_lat, last_lng, last_seen_at, last_battery_percent, last_speed_kmh, ' +
          'created_at'
        );
        data = r.data; error = r.error;
      } catch (e) { error = e; }

      if (error && /column .* does not exist/i.test(error.message || '')) {
        // Fallback: nur garantierte Spalten (Migration noch ausstehend)
        const r2 = await supabase.from('trailers').select(
          'id, name, type, is_available, image_url, next_tuev_date, next_maintenance_date, ' +
          'price_3h, price_day, price_weekend, last_lat, last_lng, last_seen_at, created_at'
        );
        return res.status(200).json({
          trailers: r2.data || [],
          warning: 'Migration trailer-fleet noch nicht gelaufen — Code/Kennzeichen/etc. fehlen.'
        });
      }
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ trailers: data || [] });
    }

    if (section === 'trailer-positions') {
      // Live-Positionen aller Trailer + Sync-State + offene Theft-Alerts
      const { data: trailers } = await supabase
        .from('trailers')
        .select('id, name, tracker_imei, last_lat, last_lng, last_seen_at, last_speed_kmh, last_battery_percent, is_moving');
      const { data: syncState } = await supabase
        .from('tracker_sync_state').select('*').eq('id', 1).maybeSingle();
      const { data: theftAlerts } = await supabase
        .from('theft_alerts').select('*').eq('status', 'open')
        .order('triggered_at', { ascending: false }).limit(10);
      return res.status(200).json({
        trailers: trailers || [],
        sync_state: syncState || null,
        open_theft_alerts: theftAlerts || [],
      });
    }

    if (section === 'calculator-state') {
      // Lade State des eingeloggten Users + echte Auslastung der letzten 30/90 Tage als Bonus
      const { data: state } = await supabase
        .from('admin_calculator_state')
        .select('state, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      // Echte Auslastung: paid bookings letzte 30/90 Tage / (Anzahl Anhänger * Tage)
      const { data: trailers } = await supabase.from('trailers').select('id');
      const trailerCount = (trailers || []).length || 1;
      const sinceLong = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: bookings } = await supabase.from('bookings')
        .select('start_time, end_time, status, created_at')
        .gte('created_at', sinceLong)
        .in('status', ['confirmed', 'active', 'returned']);

      const calcAuslastung = (windowDays) => {
        const since = Date.now() - windowDays * 86400000;
        let totalRentedHours = 0;
        (bookings || []).forEach(b => {
          const start = Math.max(new Date(b.start_time).getTime(), since);
          const end   = Math.min(new Date(b.end_time).getTime(), Date.now());
          if (end > start) totalRentedHours += (end - start) / 3600000;
        });
        const possibleHours = trailerCount * windowDays * 24;
        return possibleHours > 0 ? Math.round((totalRentedHours / possibleHours) * 100) : 0;
      };

      return res.status(200).json({
        state: (state && state.state) || null,
        updated_at: state ? state.updated_at : null,
        real_usage: {
          last_30d: calcAuslastung(30),
          last_90d: calcAuslastung(90),
          trailer_count: trailerCount,
        },
      });
    }

    if (section === 'calculator-state-save' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { state } = body;
      if (!state || typeof state !== 'object') {
        return res.status(400).json({ error: 'state required' });
      }
      await supabase.from('admin_calculator_state').upsert({
        user_id: user.id, state, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      return res.status(200).json({ ok: true });
    }

    if (section === 'resolve-theft-alert' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { alert_id, new_status, notes } = body;
      if (!alert_id || !['false_alarm', 'resolved', 'investigating'].includes(new_status)) {
        return res.status(400).json({ error: 'alert_id + new_status required' });
      }
      await supabase.from('theft_alerts')
        .update({ status: new_status, notes: notes || null })
        .eq('id', alert_id);
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

      // Rückgabe-Statistiken (letzte 30 Tage): Heatmap-Daten + KPIs
      let returnStats = null;
      try {
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data: returns } = await supabase.from('bookings')
          .select('id, return_status, return_lat, return_lng, return_distance_m, return_extra_fee, actual_return_time, free_floating, trailers(name)')
          .eq('status', 'returned')
          .gte('actual_return_time', since)
          .not('return_status', 'is', null)
          .order('actual_return_time', { ascending: false });
        const rs = returns || [];
        const byStatus = { heimat: 0, free_floating_ok: 0, wrong_spot_in_bremen: 0, outside_bremen: 0 };
        rs.forEach(r => { if (byStatus[r.return_status] != null) byStatus[r.return_status]++; });
        const distances = rs.map(r => r.return_distance_m).filter(d => d != null && d >= 0);
        const avgDist = distances.length ? Math.round(distances.reduce((a,b)=>a+b,0) / distances.length) : null;
        const totalFees = rs.reduce((s, r) => s + (Number(r.return_extra_fee) || 0), 0);
        const wrongCount = byStatus.wrong_spot_in_bremen + byStatus.outside_bremen;
        const wrongPct = rs.length ? Math.round((wrongCount / rs.length) * 100) : 0;
        returnStats = {
          total: rs.length,
          byStatus,
          avgDistanceM: avgDist,
          wrongPct,
          totalExtraFees: Math.round(totalFees * 100) / 100,
          recent: rs.slice(0, 20).map(r => ({
            id: r.id,
            status: r.return_status,
            distance_m: r.return_distance_m,
            extra_fee: r.return_extra_fee,
            free_floating: r.free_floating,
            returned_at: r.actual_return_time,
            trailer_name: r.trailers?.name || '–',
            lat: r.return_lat, lng: r.return_lng,
          })),
        };
      } catch (e) { /* Spalten evtl. noch nicht migriert */ }

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
        returnStats,
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
      return_photo_url, ladeflaeche_photo_url, precheck_photo_url, insurance_type, insurance_amount,
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
