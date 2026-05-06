/**
 * SimpleTrailer Cron: Daily-Briefing
 *
 * Laeuft taeglich 6:00 UTC (= 8:00 Berlin).
 * Aggregiert ALLES was Lion heute wissen muss in EINE Mail:
 *  - Anomalien (kritisch + wichtig)
 *  - Latest AI-Insight (Empfehlung der Woche)
 *  - Heutiger Insta-Post-Vorschlag (aus social_posts_queue)
 *  - Top Bugs (wenn Sentry-Token)
 *  - Pending Buchungen / ueberfaellige Anhaenger
 *  - Gestern Performance (Buchungen, Umsatz)
 *
 * Dann 1 Mail "☀️ Dein Tagesplan" an info@simpletrailer.de.
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { getLionEmail } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const items = []; // { severity: 'red'|'yellow'|'green'|'info', icon, title, detail, action_link? }
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1) Anomalien
    const { data: stalePending } = await supabase
      .from('bookings')
      .select('id, customer_email, customer_name, total_amount, created_at')
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo);

    if ((stalePending || []).length > 0) {
      items.push({
        severity: 'red',
        icon: '🔴',
        title: `${stalePending.length} Buchung${stalePending.length>1?'en':''} seit >1h pending`,
        detail: 'Vermutlich Stripe-Zahlungsfehler — Mieter manuell kontaktieren.',
        action_link: 'https://simpletrailer.de/admin'
      });
    }

    const { data: actives } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, end_time, actual_return_time')
      .eq('status', 'active');

    const overdue = (actives || []).filter(b => {
      const end = new Date(b.end_time).getTime();
      return Date.now() > end + 3600000 && !b.actual_return_time;
    });

    if (overdue.length > 0) {
      items.push({
        severity: 'red',
        icon: '🔴',
        title: `${overdue.length} Anhänger überfällig`,
        detail: 'Mietende > 1h vorbei, keine Rückgabe registriert.',
        action_link: 'https://simpletrailer.de/admin'
      });
    }

    // 2) Heutiger Insta-Post-Vorschlag
    const dateStr = now.toISOString().slice(0, 10);
    let socialPost = null;
    try {
      const { data: posts } = await supabase
        .from('social_posts_queue')
        .select('*')
        .eq('scheduled_for', dateStr)
        .eq('status', 'draft')
        .limit(1);
      if (posts && posts[0]) socialPost = posts[0];
    } catch (e) { /* table missing */ }

    if (socialPost) {
      items.push({
        severity: 'yellow',
        icon: '📱',
        title: `Insta-Post für heute genehmigen + posten`,
        detail: `Topic: ${socialPost.topic_type} · Caption + Hashtags + Bild-Idee bereit.`,
        action_link: 'https://simpletrailer.de/admin'
      });
    }

    // 3) Letzte AI-Insight
    let latestInsight = null;
    try {
      const { data: insights } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('type', 'weekly-advisor')
        .order('created_at', { ascending: false })
        .limit(1);
      if (insights && insights[0]) latestInsight = insights[0];
    } catch (e) { /* table missing */ }

    // 4) Content-Drafts (Ratgeber-Artikel)
    let pendingDrafts = [];
    try {
      const { data } = await supabase
        .from('content_drafts')
        .select('id, type, title, created_at')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(3);
      pendingDrafts = data || [];
    } catch (e) { /* table missing */ }

    if (pendingDrafts.length > 0) {
      items.push({
        severity: 'yellow',
        icon: '📝',
        title: `${pendingDrafts.length} Content-Draft${pendingDrafts.length>1?'s':''} wartet auf Approval`,
        detail: pendingDrafts.map(d => `• ${d.type}: "${d.title}"`).join('<br>'),
        action_link: 'https://simpletrailer.de/admin'
      });
    }

    // 4b) TÜV / Wartung fällig in ≤ 7 Tagen (oder überfällig) → red
    try {
      const { data: trailers } = await supabase.from('trailers')
        .select('name, next_tuev_date, next_maintenance_date');
      const today = new Date(); today.setHours(0,0,0,0);
      const inDays = (d) => Math.ceil((new Date(d + 'T12:00:00') - today) / 86400000);
      const findings = [];
      for (const t of (trailers || [])) {
        if (t.next_tuev_date) {
          const d = inDays(t.next_tuev_date);
          if (d <= 7) findings.push({ name: t.name, kind: 'TÜV', days: d });
        }
        if (t.next_maintenance_date) {
          const d = inDays(t.next_maintenance_date);
          if (d <= 7) findings.push({ name: t.name, kind: 'Wartung', days: d });
        }
      }
      if (findings.length > 0) {
        items.push({
          severity: 'red',
          icon: '🔧',
          title: `${findings.length} TÜV/Wartung in ≤ 7 Tagen fällig`,
          detail: findings.map(o => `• ${o.kind} "${o.name}": ${o.days < 0 ? `vor ${Math.abs(o.days)}T überfällig` : (o.days === 0 ? '<strong>HEUTE</strong>' : `in ${o.days} Tag${o.days===1?'':'en'}`)}`).join('<br>'),
          action_link: 'https://simpletrailer.de/admin'
        });
      }
    } catch (e) { /* trailers Tabelle Spalte fehlt */ }

    // 4c) Bremen-Zulassungstermin früher als gebucht?
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
            title: `Früherer Bremen-Zulassungstermin: ${fmt(earliest)}`,
            detail: `Dein gebuchter Termin ist ${fmt(deadline)} — bei service.bremen.de schnell buchen.`,
            action_link: 'https://www.service.bremen.de/dienstleistungen/kraftfahrzeug-anmelden-8389?template=20_sp_dienstleistungen_termine_d&typ=kurz',
          });
        }
      }
    } catch (e) {}

    // 5) Gestern Performance
    const { data: yesterdayBookings } = await supabase
      .from('bookings')
      .select('total_amount, status, created_at')
      .gte('created_at', yesterday)
      .lt('created_at', todayStart);

    const yPaid = (yesterdayBookings || []).filter(b => ['confirmed','active','returned'].includes(b.status));
    const yRevenue = yPaid.reduce((s,b) => s + (b.total_amount||0), 0);

    // 6) Notify-Liste-Updates
    let notifyCount = 0;
    try {
      const { count } = await supabase
        .from('notify_when_available')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday);
      notifyCount = count || 0;
    } catch (e) { /* table missing */ }

    if (notifyCount > 0) {
      items.push({
        severity: 'info',
        icon: '👀',
        title: `${notifyCount} neue "Benachrichtigen-wenn-da"-Anmeldung${notifyCount>1?'en':''}`,
        detail: 'Email gesammelt für nicht-verfügbare Anhänger.',
      });
    }

    // 7) Newsletter-Anmeldungen
    let newsletterCount = 0;
    try {
      const { count } = await supabase
        .from('newsletter_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .gte('created_at', yesterday);
      newsletterCount = count || 0;
    } catch (e) { /* table missing */ }

    if (newsletterCount > 0) {
      items.push({
        severity: 'info',
        icon: '✉️',
        title: `${newsletterCount} neue Newsletter-Bestätigung${newsletterCount>1?'en':''}`,
        detail: 'Double-Opt-In durchlaufen.',
      });
    }

    // Wenn nix los: positive Meldung
    if (items.length === 0) {
      items.push({
        severity: 'green',
        icon: '🟢',
        title: 'Alles ruhig',
        detail: 'Keine Anomalien, keine offenen Tasks. Heute kannst Du an strategischem arbeiten — z.B. ads-specialist für Kampagnen-Optimierung fragen.',
      });
    }

    // Sortieren nach Severity
    const severityOrder = { red: 0, yellow: 1, info: 2, green: 3 };
    items.sort((a,b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Mail bauen
    const dateLabel = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });

    const itemsHtml = items.map(item => {
      const colors = { red:'#ef4444', yellow:'#f59e0b', info:'#60a5fa', green:'#4ade80' };
      const bg = { red:'#1f0a0a', yellow:'#1f1606', info:'#0f1929', green:'#0a1f0a' };
      return `<div style="background:${bg[item.severity]};border-left:3px solid ${colors[item.severity]};border-radius:6px;padding:12px 16px;margin-bottom:10px;">
        <div style="font-size:.92rem;font-weight:600;margin-bottom:4px;">${item.icon} ${item.title}</div>
        <div style="font-size:.82rem;color:#aaa;line-height:1.5;">${item.detail}</div>
        ${item.action_link ? `<a href="${item.action_link}" style="display:inline-block;margin-top:8px;font-size:.78rem;color:${colors[item.severity]};text-decoration:none;">→ Im Admin öffnen</a>` : ''}
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.3rem;margin:14px 0 4px;">☀️ Dein Tagesplan</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">${dateLabel}</p>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:20px;margin-bottom:18px;">
          <h3 style="font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:#888;margin:0 0 14px;">Heute zu tun</h3>
          ${itemsHtml}
        </div>

        ${latestInsight ? `<div style="background:linear-gradient(135deg,#1a0f29,#0d0d0d);border:1px solid #3a1a5f;border-radius:14px;padding:20px;margin-bottom:18px;">
          <h3 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#a78bfa;margin:0 0 12px;">💡 Aktuelle AI-Empfehlung</h3>
          <div style="font-size:.88rem;line-height:1.6;color:#ddd;max-height:200px;overflow:hidden;">
            ${latestInsight.recommendation.slice(0, 500)}${latestInsight.recommendation.length > 500 ? '…' : ''}
          </div>
          <a href="https://simpletrailer.de/admin" style="display:inline-block;margin-top:10px;font-size:.78rem;color:#a78bfa;text-decoration:none;">→ Volle Empfehlung im Cockpit</a>
        </div>` : ''}

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:20px;margin-bottom:18px;">
          <h3 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#888;margin:0 0 12px;">📊 Gestern</h3>
          <table style="width:100%;font-size:.88rem;">
            <tr><td style="padding:6px 0;color:#888;">Buchungen</td><td style="padding:6px 0;text-align:right;font-weight:600;">${yPaid.length}</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Brutto-Umsatz</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#E85D00;">${yRevenue.toFixed(2).replace('.',',')} €</td></tr>
          </table>
        </div>

        <div style="text-align:center;margin-top:24px;">
          <a href="https://simpletrailer.de/admin" style="display:inline-block;background:#E85D00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Cockpit öffnen →</a>
        </div>
        <p style="font-size:.7rem;color:#555;text-align:center;margin:24px 0 0;">Auto-generiert · daily-briefing · taeglich 8:00 Berlin</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Briefing <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: getLionEmail('briefing'),
      subject: `[ST-Briefing] ☀️ Dein Tagesplan — ${items.filter(i=>i.severity==='red').length}🔴 ${items.filter(i=>i.severity==='yellow').length}🟡`,
      html
    });

    return res.status(200).json({ ok: true, items_count: items.length, severity_breakdown: items.reduce((acc,i)=>{acc[i.severity]=(acc[i.severity]||0)+1;return acc;},{}) });
  } catch (err) {
    console.error('daily-briefing:', err);
    return res.status(500).json({ error: err.message });
  }
};
