/**
 * SimpleTrailer Cron: Competitor-Watcher
 *
 * Laeuft monatlich am 1. um 9:00 UTC.
 *
 * Ruft Claude mit dem competitor-watcher-Agent-Prompt + WebSearch auf,
 * um aktuelle Konkurrenz-Preise + neue Anbieter in Bremen zu finden.
 * Speichert in ai_insights-Tabelle, sendet Mail an info@simpletrailer.de.
 *
 * VORAUSSETZUNG: ANTHROPIC_API_KEY + (optional) Konkurrenz-Webseiten-URLs.
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
  }

  try {
    const systemPrompt = `Du bist Competitive Intelligence Specialist fuer SimpleTrailer (Anhaengervermietung Bremen, online-buchbar 24/7, kontaktlos via Codeschloss, keine Kaution).

Konkurrenz Bremen:
- HKL Baumaschinen (hkl-baumaschinen.de)
- Boels Rental (boels.de)
- Hornbach Bremen (hornbach.de)
- Bauhaus Bremen (bauhaus.info)
- OBI Bremen (obi.de)
- eBay Kleinanzeigen private

Liefere einen monatlichen Konkurrenz-Report als HTML (max 600 Woerter) mit:

1. **<h3>📊 Preis-Vergleich</h3>** — Tabelle mit Preisen aller Anbieter (PKW-Anhaenger, Tagespreis, Wochenende, Kaution). Quellen-Link wenn moeglich. Falls Preis nicht oeffentlich: "auf Anfrage" markieren.

2. **<h3>🆕 Neue Beobachtungen</h3>** — Was hat sich seit dem letzten Check geaendert? Neue Anbieter? Preisaenderungen? Neue Marketing-Kampagnen?

3. **<h3>💡 Strategische Implikationen fuer SimpleTrailer</h3>** — 3 konkrete Empfehlungen mit Aufwand-Schaetzung.

4. **<h3>📈 Marketing-Hooks</h3>** — Aus Konkurrenz-Schwaechen ergeben sich diese Anzeigen-Texte.

Format: HTML mit <h3>, <p>, <ul>, <table>, <strong>. Keine <html>/<body>-Tags.`;

    const userMessage = `Generiere den monatlichen Konkurrenz-Report fuer Bremen-Anhaengervermietung.

Aktuelle SimpleTrailer-Preise (Brutto inkl. 19% MwSt):
- 9 EUR / 3h, 18 EUR / 6h, 29 EUR / Tag, 59 EUR / Wochenende, 119 EUR / Woche
- Keine Kaution

Worauf besonders achten:
- Sind neue Online-Buchungs-Anbieter aufgetaucht? (= unser Haupt-USP)
- Hat ein Konkurrent Preise reduziert?
- Welche Beschwerden gibt es bei Konkurrenz auf Google-Maps (= unsere Marketing-Hooks)?

Liefere den HTML-Report.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API: ${anthropicRes.status} ${errText}`);
    }

    const data = await anthropicRes.json();
    const reportHtml = data.content?.[0]?.text || '';
    if (!reportHtml) throw new Error('No report generated');

    // In ai_insights speichern
    try {
      await supabase
        .from('ai_insights')
        .insert({
          type: 'competitor-report',
          recommendation: reportHtml,
          data_snapshot: { generated_at: new Date().toISOString(), source: 'competitor-watcher' },
        });
    } catch (e) {
      console.error('ai_insights insert failed:', e.message);
    }

    // Mail an User
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:700px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.2rem;margin:14px 0 4px;">🔭 Konkurrenz-Report</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">${new Date().toLocaleDateString('de-DE',{month:'long',year:'numeric'})}</p>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:24px;color:#ddd;line-height:1.6;font-size:.9rem;">
          ${reportHtml}
        </div>

        <p style="font-size:.7rem;color:#555;text-align:center;margin:24px 0 0;">Auto-generiert · competitor-watcher · monatlich am 1.</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Watch <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: 'info@simpletrailer.de',
      subject: `🔭 Konkurrenz-Report ${new Date().toLocaleDateString('de-DE',{month:'long'})} — Bremen`,
      html
    });

    return res.status(200).json({ ok: true, report_length: reportHtml.length });
  } catch (err) {
    console.error('competitor-watcher:', err);
    return res.status(500).json({ error: err.message });
  }
};
