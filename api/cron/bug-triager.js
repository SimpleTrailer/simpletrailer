/**
 * SimpleTrailer Cron: Bug-Triager
 *
 * Laeuft taeglich 8:00 UTC (= 10:00 Berlin).
 * Holt Sentry-Issues der letzten 24h via Sentry-API,
 * gruppiert + priorisiert + sendet zusammenfassende Mail an info@simpletrailer.de.
 *
 * VORAUSSETZUNG: SENTRY_AUTH_TOKEN als ENV-Var in Vercel.
 * Token-Erstellung: sentry.io -> Settings -> Account -> API -> Auth Tokens
 *   Scopes: project:read, event:read
 */
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const SENTRY_ORG = 'simpletrailer-gbr';        // anpassen falls anders
const SENTRY_PROJECT = 'simpletrailer-web';    // anpassen falls anders

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch && bearerMatch[1])
              || req.headers['x-cron-token']
              || req.query.token;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.SENTRY_AUTH_TOKEN) {
    return res.status(200).json({
      ok: true,
      skipped: 'SENTRY_AUTH_TOKEN missing — bug-triager nicht aktiv',
    });
  }

  try {
    // Letzte 24h Sentry-Issues holen
    const since = Math.floor((Date.now() - 86400000) / 1000); // unix timestamp
    const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?statsPeriod=24h&query=is:unresolved`;

    const sentryRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${process.env.SENTRY_AUTH_TOKEN}` }
    });

    if (!sentryRes.ok) {
      throw new Error(`Sentry API ${sentryRes.status}: ${await sentryRes.text()}`);
    }

    const issues = await sentryRes.json();

    if (!Array.isArray(issues) || issues.length === 0) {
      return res.status(200).json({ ok: true, issues: 0, sent_mail: false });
    }

    // Falsch-Positive filtern
    const ignorePatterns = [
      /ResizeObserver loop/i,
      /Non-Error promise rejection/i,
      /chrome-extension/i,
      /moz-extension/i,
      /safari-extension/i,
    ];
    const filtered = issues.filter(i => {
      const title = i.title || '';
      return !ignorePatterns.some(p => p.test(title));
    });

    if (filtered.length === 0) {
      return res.status(200).json({ ok: true, issues_total: issues.length, after_filter: 0, sent_mail: false });
    }

    // Priorisieren (top 5)
    filtered.sort((a, b) => (b.count || 0) - (a.count || 0));
    const top = filtered.slice(0, 5);

    // Severity je nach Auftreten
    const severity = (count) => {
      if (count > 50) return { color: '#ef4444', icon: '🔴', label: 'Kritisch' };
      if (count > 10) return { color: '#f59e0b', icon: '🟡', label: 'Wichtig' };
      return { color: '#4ade80', icon: '🟢', label: 'Niedrig' };
    };

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.2rem;margin:14px 0 4px;">🐛 Bug-Triage</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">${filtered.length} aktive Issues · letzte 24h</p>
        </div>

        ${top.map((issue, i) => {
          const sev = severity(issue.count || 0);
          return `<div style="background:#1a1a1a;border-left:3px solid ${sev.color};border-radius:8px;padding:14px 18px;margin-bottom:12px;">
            <div style="font-size:.78rem;color:#888;margin-bottom:4px;">#${i+1} · ${sev.icon} ${sev.label} · ${issue.count}× in 24h</div>
            <div style="font-size:.92rem;font-weight:600;margin-bottom:6px;">${issue.title}</div>
            <div style="font-size:.78rem;color:#aaa;line-height:1.5;">
              ${issue.culprit ? `<div style="margin-bottom:4px;"><strong>Wo:</strong> ${issue.culprit}</div>` : ''}
              ${issue.userCount ? `<div><strong>Betroffen:</strong> ${issue.userCount} User</div>` : ''}
            </div>
            <a href="${issue.permalink}" style="display:inline-block;margin-top:8px;color:#E85D00;text-decoration:none;font-size:.78rem;">Im Sentry öffnen →</a>
          </div>`;
        }).join('')}

        <div style="text-align:center;margin-top:20px;">
          <a href="https://${SENTRY_ORG}.sentry.io/issues/" style="display:inline-block;background:#E85D00;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:.9rem;">Alle Issues in Sentry →</a>
        </div>
        <p style="font-size:.7rem;color:#555;text-align:center;margin:24px 0 0;">Auto-generiert · bug-triager · taeglich 8:00 UTC</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Bug-Triage <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: 'info@simpletrailer.de',
      subject: `🐛 ${filtered.length} aktive Bugs — Top: ${top[0]?.title?.slice(0, 60) || 'unbekannt'}`,
      html
    });

    return res.status(200).json({
      ok: true,
      issues_total: issues.length,
      after_filter: filtered.length,
      mail_sent: true,
    });
  } catch (err) {
    console.error('bug-triager:', err);
    return res.status(500).json({ error: err.message });
  }
};
