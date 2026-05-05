/**
 * SimpleTrailer Cron: Legal Quarterly Audit
 *
 * Laeuft 1. Januar/April/Juli/Oktober um 9:00 UTC.
 * Liest agb.html, datenschutz.html, impressum.html, ruft Claude mit
 * legal-checker-Prompt + den Inhalten, sendet Audit-Mail an info@.
 */
const { Resend } = require('resend');
const { readFileSync } = require('fs');
const { join } = require('path');

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
  }

  try {
    // Legal-Files via HTTPS holen (Vercel-Function hat keinen Filesystem-Zugriff
    // auf die statisch-deployten HTML-Files in der gleichen Form)
    const fetchHtml = async (path) => {
      const r = await fetch(`https://simpletrailer.de${path}`);
      if (!r.ok) throw new Error(`Fetch ${path}: ${r.status}`);
      const text = await r.text();
      // Body extrahieren um Token zu sparen
      const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/);
      return bodyMatch ? bodyMatch[1] : text;
    };

    const [agb, datenschutz, impressum] = await Promise.all([
      fetchHtml('/agb').catch(() => ''),
      fetchHtml('/datenschutz').catch(() => ''),
      fetchHtml('/impressum').catch(() => ''),
    ]);

    const systemPrompt = `Du bist legal-checker fuer SimpleTrailer GbR (Anhaengervermietung Bremen). Du pruefst die Webseiten-Texte auf deutsches Recht (PAngV, BGB, DSGVO, UStG, MStV).

Du bist KEIN Anwalt sondern ein Pre-Check-Filter. Bei kritischen Risiken: Anwalts-Termin empfehlen.

Liefere einen quartalsweisen Legal-Audit-Report als HTML (max 800 Woerter):

<h3>📋 Audit-Status</h3><p>Risiko-Level: Niedrig/Mittel/Hoch + Zusammenfassung in 1-2 Saetzen.</p>

<h3>🔴 Kritisch (sofort fixen)</h3>
<ul><li>Pro Finding: Datei + konkretes Problem + rechtl. Risiko + Fix-Vorschlag</li></ul>

<h3>🟡 Empfehlung</h3>
<ul><li>...</li></ul>

<h3>🟢 Was passt</h3>
<ul>Was solide ist</ul>

<h3>⚠️ Anwalts-Termin empfohlen für</h3>
<p>Falls juristisch komplex.</p>

Pflicht-Checks fuer SimpleTrailer:
- AGB §3 Widerrufsrecht: Mietvertrag mit Termin AUSGESCHLOSSEN nach §312g II Nr.9 BGB - muss explizit drinstehen
- AGB §5 Preise: "inkl. 19% MwSt" + Brutto-Pflicht (PAngV)
- AGB §6 Storno: Klare %-Staffelung
- AGB Klausel "Stripe Off-Session-Charges": muss bei Vertragsschluss explizit drin sein
- Datenschutz: alle US-Tools (Stripe, Vercel, Anthropic, Sentry, Microsoft Clarity) genannt + Drittland-Hinweis
- Impressum: Steuernummer ODER USt-IdNr (sobald da)
- OS-Plattform-Hinweis (Art. 14 ODR-VO) bei Online-Verkauf

Format: HTML. Keine <html>/<body>-Tags.`;

    const userMessage = `Quartalsweiser Legal-Audit fuer SimpleTrailer.

# AGB (agb.html)
${agb.slice(0, 8000)}

# Datenschutz (datenschutz.html)
${datenschutz.slice(0, 8000)}

# Impressum (impressum.html)
${impressum.slice(0, 4000)}

Fuehre den Audit durch.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) throw new Error(`Anthropic ${anthropicRes.status}`);

    const data = await anthropicRes.json();
    const reportHtml = data.content?.[0]?.text || '';

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:700px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.2rem;margin:14px 0 4px;">⚖️ Quartals-Legal-Audit</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">${new Date().toLocaleDateString('de-DE')}</p>
        </div>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:24px;color:#ddd;line-height:1.6;font-size:.9rem;">
          ${reportHtml}
        </div>
        <div style="background:#0f0f0f;border-left:3px solid #f59e0b;border-radius:8px;padding:14px 18px;margin-top:18px;font-size:.82rem;color:#bbb;">
          <strong>Hinweis:</strong> Dieser Audit ist Pre-Check, nicht juristische Beratung. Bei kritischen Findings einen Anwalt konsultieren.
        </div>
        <p style="font-size:.7rem;color:#555;text-align:center;margin:24px 0 0;">legal-quarterly-audit · 1. Januar/April/Juli/Oktober</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Legal <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: 'info@simpletrailer.de',
      subject: `⚖️ Legal-Audit Quartal — Pruefung von AGB/Datenschutz/Impressum`,
      html
    });

    return res.status(200).json({ ok: true, length: reportHtml.length });
  } catch (err) {
    console.error('legal-quarterly-audit:', err);
    return res.status(500).json({ error: err.message });
  }
};
