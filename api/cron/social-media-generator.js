/**
 * SimpleTrailer Cron: Social-Media-Generator
 *
 * Laeuft taeglich 7:00 UTC (= 9:00 Berlin).
 * Generiert Insta/FB-Post fuer den NAECHSTEN Tag basierend auf Wochentag-Plan:
 *   Mo: Ratgeber-Tipp
 *   Di: Kunden-Stimme / Use-Case
 *   Mi: Behind-the-Scenes
 *   Do: Anhaenger-Showcase / Feature
 *   Fr: Wochenend-Push (Buchungs-CTA)
 *   Sa: Trip-/Aktivitaets-Inspiration
 *   So: Wochen-Recap / Saison-Tipp
 *
 * Speichert in social_posts_queue, schickt Vorschau-Mail an info@simpletrailer.de.
 * User klickt 1x "Approve & Post" und postet manuell (Phase C).
 *
 * VORAUSSETZUNG: Tabelle social_posts_queue (siehe supabase-migration-social-posts.sql)
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

const WEEKDAY_PLAN = {
  1: { type: 'ratgeber',       theme: 'Praktischer Tipp zum Anhaenger-Mieten oder -Beladen' },
  2: { type: 'kunde',          theme: 'Use-Case / typische Kunden-Situation in Bremen' },
  3: { type: 'behind-scenes',  theme: 'Behind-the-Scenes: Standort, Vorbereitung, Logistik' },
  4: { type: 'showcase',       theme: 'Anhaenger-Feature im Detail (Plane, Maße, Codeschloss)' },
  5: { type: 'wochenend-push', theme: 'Direkter Wochenend-CTA: 59€ Wochenend-Tarif, jetzt buchen' },
  6: { type: 'inspiration',    theme: 'Trip-Inspiration: was kann ich am Wochenende mit Anhaenger machen' },
  0: { type: 'recap',          theme: 'Saison-Tipp / Wochen-Recap / FAQ-Antwort' },
};

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
    // Plan fuer den NAECHSTEN Tag (heute generieren, morgen posten)
    const tomorrow = new Date(Date.now() + 86400000);
    const dayOfWeek = tomorrow.getDay();
    const plan = WEEKDAY_PLAN[dayOfWeek];
    const dateStr = tomorrow.toISOString().slice(0, 10);

    // Pruefen ob fuer dieses Datum schon was im Queue ist
    const { data: existing } = await supabase
      .from('social_posts_queue')
      .select('id')
      .eq('scheduled_for', dateStr)
      .limit(1);
    if (existing && existing.length > 0) {
      return res.status(200).json({ ok: true, skipped: 'already-exists', date: dateStr });
    }

    const systemPrompt = `Du bist Social-Media-Manager fuer SimpleTrailer GbR — eine PKW-Anhaengervermietung in Bremen.

Brand-Identitaet:
- Pragmatisch, direkt, anti-Buerokratie ("kein Papierkram, keine Wartezeit, keine Kaution")
- Du-Form, locker aber kompetent
- Lokal Bremen-fokussiert
- USPs: 24/7 online buchbar · kontaktloses Codeschloss · keine Kaution · Festpreise

Anhaenger-Specs:
- PKW-Plane: 250x130x130cm, 750kg zGG (fuehrerscheinfrei B), ungebremst
- Preise inkl. 19% MwSt: 9€/3h, 18€/6h, 29€/Tag, 59€/Wochenende, 119€/Woche
- Standort Bremen, simpletrailer.de

Konkurrenz: HKL (gross/teuer), Boels (Kette/Kaution), Baumaerkte (Wartezeit). Wir sind das digitale Self-Service-Angebot.

# Aufgabe
Erstelle EINEN Instagram-Post fuer SimpleTrailer im JSON-Format.

JSON-Schema:
{
  "caption": "Hauptpost-Text — knapp, direkt, max 220 Zeichen. Hook in 1. Zeile, dann Mehrwert. Du-Form. Mit 1 CTA am Ende.",
  "hashtags": "Zeile mit 10-15 Hashtags (gemischt: lokale Bremen-Tags + Themen-Tags + Anhaenger-Tags). Format: '#bremen #anhaenger #...'",
  "image_prompt": "Klare Beschreibung wie das Bild aussehen soll. Style: clean, modern, dark background bevorzugt, Brand-Farben orange (#E85D00) + weiss + dunkel. Falls Mockup-Foto-Stil: konkret was zu sehen ist. KEIN generisches AI-Aussehen. Max 200 Zeichen.",
  "alt_text": "Barrierefreie Bildbeschreibung fuer Instagram, 1 Satz."
}

# Regeln
- Kein Marketing-BS ("Premium-Erlebnis", "innovativ")
- Keine Emojis am Ende der Caption (1-2 mittendrin ok)
- CTA realistisch: "Direkt online buchen", "Verfuegbarkeit checken", "Mehr im Profil"
- Hashtags: 5-7 lokal (#bremen, #moinbremen, #28237, #findorff, #vegesack, #neustadt, #bremerland), 3-5 thematisch (#umzug, #moebeltransport, #sperrmuell, #garten, #diy, #handwerker, #anhaenger), 2-3 Brand (#simpletrailer, #anhaengerbremen)
- Bild-Prompt MUSS lokalen Bezug haben oder Anhaenger-Foto zeigen, nicht generisch

Liefere NUR das JSON, keine Erklaerung drumherum.`;

    const userMessage = `Generiere den Insta-Post fuer ${tomorrow.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long'})}.

Wochentags-Thema: **${plan.theme}**
Topic-Type: ${plan.type}

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
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API: ${anthropicRes.status} ${errText}`);
    }

    const data = await anthropicRes.json();
    let postText = data.content?.[0]?.text || '';

    // JSON aus dem Text extrahieren (manchmal mit ```json wrapper)
    const jsonMatch = postText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response: ' + postText.slice(0, 200));

    let post;
    try {
      post = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('JSON parse: ' + e.message + ' | ' + jsonMatch[0].slice(0, 200));
    }

    if (!post.caption || !post.hashtags) {
      throw new Error('Missing caption/hashtags in: ' + JSON.stringify(post));
    }

    // In DB speichern
    const { data: inserted, error: insertError } = await supabase
      .from('social_posts_queue')
      .insert({
        scheduled_for: dateStr,
        channel: 'instagram',
        topic_type: plan.type,
        caption: post.caption,
        hashtags: post.hashtags,
        image_prompt: post.image_prompt || '',
        status: 'draft',
      })
      .select()
      .single();

    if (insertError) {
      console.error('insert failed:', insertError.message);
      // Tabelle fehlt evtl. — trotzdem Mail schicken
    }

    // Vorschau-Mail an User
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
      <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          <h1 style="font-size:1.2rem;margin:14px 0 4px;">📱 Insta-Post fuer morgen</h1>
          <p style="color:#888;font-size:.85rem;margin:0;">${tomorrow.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long'})} · ${plan.type}</p>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:22px;margin-bottom:14px;">
          <div style="font-size:.7rem;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">📝 Caption (zum Kopieren)</div>
          <div style="font-size:.92rem;line-height:1.6;white-space:pre-wrap;background:#0a0a0a;padding:14px;border-radius:8px;border-left:3px solid #E85D00;">${post.caption}</div>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:22px;margin-bottom:14px;">
          <div style="font-size:.7rem;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">#️⃣ Hashtags</div>
          <div style="font-size:.85rem;line-height:1.5;background:#0a0a0a;padding:14px;border-radius:8px;color:#60a5fa;">${post.hashtags}</div>
        </div>

        <div style="background:#1a0d29;border:1px solid #3a1a5f;border-radius:14px;padding:22px;margin-bottom:14px;">
          <div style="font-size:.7rem;color:#a78bfa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">🎨 Bild-Idee fuer Canva/Midjourney</div>
          <div style="font-size:.85rem;line-height:1.6;color:#ddd;">${post.image_prompt || 'Anhänger-Mockup mit lokalem Bremen-Bezug'}</div>
          ${post.alt_text ? `<div style="margin-top:12px;font-size:.75rem;color:#888;"><strong>Alt-Text:</strong> ${post.alt_text}</div>` : ''}
        </div>

        <div style="background:#0a1f0a;border:1px solid #1a3a1a;border-radius:14px;padding:18px;margin-bottom:14px;">
          <p style="margin:0 0 12px;font-size:.85rem;color:#bbb;">
            <strong style="color:#4ade80;">So gehst Du vor (~3 Min):</strong>
          </p>
          <ol style="font-size:.85rem;line-height:1.7;color:#bbb;margin:0;padding-left:20px;">
            <li>Bild in Canva/Midjourney erstellen mit Prompt oben</li>
            <li>Caption + Hashtags kopieren</li>
            <li>In Instagram posten (Bild + Caption)</li>
            <li>Im Cockpit als "gepostet" markieren</li>
          </ol>
        </div>

        <div style="text-align:center;margin-top:20px;">
          <a href="https://simpletrailer.de/admin" style="display:inline-block;background:#E85D00;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:.9rem;">Cockpit oeffnen →</a>
        </div>
        <p style="font-size:.7rem;color:#555;text-align:center;margin:24px 0 0;">Auto-generiert · social-media-generator · taeglich 7:00 UTC</p>
      </div>
    </body></html>`;

    await resend.emails.send({
      from: 'SimpleTrailer Social <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: 'info@simpletrailer.de',
      subject: `📱 Insta-Post ready: ${plan.type} fuer ${tomorrow.toLocaleDateString('de-DE',{weekday:'short'})}`,
      html
    });

    return res.status(200).json({
      ok: true,
      scheduled_for: dateStr,
      topic: plan.type,
      caption_length: post.caption.length,
      stored: !insertError,
    });
  } catch (err) {
    console.error('social-media-generator:', err);
    return res.status(500).json({ error: err.message });
  }
};
