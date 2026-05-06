/**
 * SimpleTrailer Cron: Weekly-Ratgeber-Generator
 *
 * Laeuft Mittwochs 8:00 UTC.
 * Generiert SEO-Ratgeber-Artikel-Draft via content-writer-Prompt:
 *  - Themen-Pool durchrotieren (Möbel-Transport, Garten, Sperrmüll, Anhänger-Specs etc.)
 *  - Mindestens 1.000 Wörter, SEO-optimiert (H1, H2, FAQ-Block)
 *  - Speichert in content_drafts (Status 'draft')
 *  - Mail an Lion mit Preview + Approve-Link
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { getLionEmail } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const TOPIC_POOL = [
  { title: 'Möbel transportieren ohne LKW: So sparst du Zeit und Geld', keyword: 'möbel transportieren bremen', slug: 'moebel-transportieren-ohne-lkw' },
  { title: 'Sperrmüll selbst zur Deponie bringen — Anleitung Bremen', keyword: 'sperrmüll selbst entsorgen bremen', slug: 'sperrmuell-selbst-entsorgen' },
  { title: 'Anhänger ankuppeln: 10 Schritte für Anfänger', keyword: 'anhänger ankuppeln anleitung', slug: 'anhaenger-ankuppeln-anfaenger' },
  { title: 'Anhänger richtig beladen: Fehler die teuer werden', keyword: 'anhänger beladen tipps', slug: 'anhaenger-beladen-tipps' },
  { title: 'Welcher Anhänger mit B-Führerschein? Vollständige Übersicht', keyword: 'anhänger b führerschein', slug: 'welcher-anhaenger-b-fuehrerschein-uebersicht' },
  { title: 'Garten-Sachen transportieren: So bekommst du alles ins Auto (oder den Anhänger)', keyword: 'gartenabfälle transportieren', slug: 'garten-transportieren' },
  { title: 'Umzug ohne Umzugsfirma: Mit Anhänger zum halben Preis', keyword: 'umzug günstig bremen', slug: 'umzug-mit-anhaenger-bremen' },
  { title: 'Auto im Anhänger transportieren: Worauf du achten musst', keyword: 'autotransport mit anhänger', slug: 'auto-transportieren-anhaenger' },
  { title: '5 Dinge die du nicht in einen Anhänger packen solltest', keyword: 'anhänger beladen verboten', slug: 'anhaenger-falsche-beladung' },
  { title: 'Wochenend-Transport: Was du bis Montag erledigen kannst', keyword: 'wochenende anhänger mieten', slug: 'wochenend-transport-bremen' },
];

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
    // Bereits genutzte Slugs filtern
    let usedSlugs = [];
    try {
      const { data } = await supabase.from('content_drafts').select('slug').eq('type', 'ratgeber');
      usedSlugs = (data || []).map(d => d.slug).filter(Boolean);
    } catch (e) { /* table missing */ }

    const available = TOPIC_POOL.filter(t => !usedSlugs.includes(t.slug));
    if (available.length === 0) {
      return res.status(200).json({ ok: true, skipped: 'all-topics-used' });
    }

    // Random Topic auswählen
    const topic = available[Math.floor(Math.random() * available.length)];

    const systemPrompt = `Du bist content-writer fuer SimpleTrailer GbR (Anhaengervermietung Bremen). Brand-Stil: Du-Form, pragmatisch, anti-Buerokratie ("kein Papierkram, keine Wartezeit, keine Kaution").

Anhaenger-Specs:
- PKW-Plane: 251×137×130 cm, 750 kg zGG (fuehrerscheinfrei B), ungebremst
- Preise (inkl. 19% MwSt): 9 EUR/3h, 18 EUR/6h, 29 EUR/Tag, 59 EUR/Wochenende, 119 EUR/Woche
- USPs: 24/7 buchbar online, kontaktlos via Codeschloss, keine Kaution

# Aufgabe
Schreibe einen SEO-optimierten Ratgeber-Artikel als HTML-Block (kein <html>/<body>-Wrapper).

Struktur:
1. <h1>Hauptueberschrift mit dem Keyword</h1>
2. Erste 100 Woerter mit Keyword + Bremen-Bezug
3. Mindestens 5 <h2>-Sektionen (Frage-Format gut)
4. Mindestens 1.000 Woerter total
5. Am Ende ein <h2>Haeufige Fragen</h2> mit 3-5 <h3>-Fragen + Antworten
6. CTA-Box am Ende: Link zu simpletrailer.de mit "Direkt buchen ab 9 EUR" -- mit <a href="/" style="...">

SEO-Regeln:
- Lokal-Bremen-Bezuege (Stadtteile: Findorff, Walle, Vegesack, Neustadt)
- Keyword 3-5x natuerlich verwenden
- Konkrete Zahlen, Listen, Tabellen wo passend
- KEIN Marketing-BS ("Premium", "innovativ", "revolutionaer")

Liefere als JSON:
{
  "title": "<H1-Titel>",
  "slug": "<URL-slug>",
  "meta_description": "<155 Zeichen SEO-Description>",
  "keywords": ["keyword1", "keyword2", ...],
  "content_html": "<vollstaendiger HTML-Block>"
}

JSON-only, keine Erklaerung drumherum.`;

    const userMessage = `Erstelle Ratgeber-Artikel:
**Titel:** ${topic.title}
**Hauptkeyword:** ${topic.keyword}
**Slug:** ${topic.slug}

Liefere das JSON.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      throw new Error(`Anthropic ${anthropicRes.status}: ${await anthropicRes.text()}`);
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const draft = JSON.parse(jsonMatch[0]);
    if (!draft.title || !draft.content_html) throw new Error('Missing fields');

    // In content_drafts speichern
    let inserted = null;
    try {
      const { data: ins } = await supabase
        .from('content_drafts')
        .insert({
          type: 'ratgeber',
          title: draft.title,
          slug: draft.slug || topic.slug,
          content_html: draft.content_html,
          meta_description: draft.meta_description || '',
          keywords: draft.keywords || [topic.keyword],
          status: 'draft',
        })
        .select()
        .single();
      inserted = ins;
    } catch (e) {
      console.error('content_drafts insert failed:', e.message);
    }

    // Vorschau-Mail
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:700px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.2rem;margin:14px 0 4px;">📝 Neuer Ratgeber-Draft</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">content-writer · ${new Date().toLocaleDateString('de-DE')}</p>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:24px;margin-bottom:18px;">
          <h2 style="margin:0 0 8px;font-size:1.2rem;color:#E85D00;">${draft.title}</h2>
          <p style="font-size:.85rem;color:#888;margin:0 0 14px;"><strong>Keyword:</strong> ${topic.keyword} · <strong>Slug:</strong> /ratgeber/${draft.slug || topic.slug}</p>
          <div style="background:#0a0a0a;padding:16px;border-radius:8px;font-size:.85rem;line-height:1.6;color:#bbb;max-height:400px;overflow:hidden;">
            ${draft.content_html.slice(0, 2000)}${draft.content_html.length > 2000 ? '…<p style="color:#666;">[gekürzt — voller Artikel ~' + draft.content_html.length + ' Zeichen]</p>' : ''}
          </div>
        </div>

        <div style="background:#0a1f0a;border-left:3px solid #4ade80;border-radius:8px;padding:14px 18px;margin-bottom:14px;font-size:.85rem;color:#bbb;">
          <strong style="color:#4ade80;">So gehts weiter:</strong><br>
          1. Im Cockpit den Draft lesen + ggf. anpassen<br>
          2. Klicken auf "Approve & Publish" -> wird als /ratgeber/${draft.slug || topic.slug}.html veroeffentlicht<br>
          3. Sitemap automatisch aktualisiert
        </div>

        <div style="text-align:center;margin-top:20px;">
          <a href="https://simpletrailer.de/admin" style="display:inline-block;background:#E85D00;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:.9rem;">Im Cockpit ansehen →</a>
        </div>
        <p style="font-size:.7rem;color:#555;text-align:center;margin:24px 0 0;">Auto-generiert · weekly-ratgeber-generator · Mittwochs 8:00 UTC</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Content <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: getLionEmail('approval'),
      subject: `[ST-Approval] 📝 Ratgeber-Draft: ${draft.title.slice(0, 60)}`,
      html
    });

    return res.status(200).json({ ok: true, topic: topic.slug, stored: !!inserted, length: draft.content_html.length });
  } catch (err) {
    console.error('weekly-ratgeber-generator:', err);
    return res.status(500).json({ error: err.message });
  }
};
