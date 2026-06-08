/**
 * KI-Foto-Validierung via Claude Vision
 *
 * Prüft ob auf dem hochgeladenen Pre-Check- oder Rückgabe-Foto wirklich ein Anhänger
 * zu sehen ist (statt ein zufälliges Foto vom Handy). Schützt vor versehentlich
 * hochgeladenen Privat-Fotos und vor Missbrauch.
 *
 * Aufruf vom Frontend:
 *   POST /api/validate-photo
 *   Body: { image_url: "https://...supabase.co/.../foo.jpg", expected: "outside" | "inside" }
 *
 * Antwort:
 *   { ok: true,  is_trailer: true,  confidence: "high", reason: "..." }   → Foto passt
 *   { ok: true,  is_trailer: false, confidence: "high", reason: "..." }   → klar kein Anhänger
 *   { ok: true,  is_trailer: true,  confidence: "low",  reason: "..." }   → unsicher, lasse durch
 *
 * Bei API-Fehler oder Timeout: nicht blockieren (fail-open) damit Buchung nicht hängt.
 */
const Anthropic = require('@anthropic-ai/sdk');
const { setCors } = require('./_cors');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // Wenn API-Key fehlt: explizit melden statt silent fail-open
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY fehlt — KI-Validierung uebersprungen');
      return res.status(200).json({ ok: true, is_trailer: true, confidence: 'low', reason: 'KI-Key nicht konfiguriert' });
    }

    const { image_url, expected } = req.body || {};
    if (!image_url) return res.status(400).json({ error: 'image_url fehlt' });

    // URL-Whitelist: nur unsere eigenen Supabase-Storage-URLs erlauben (kein SSRF/Cost-Drain).
    // Trailing-Slash in SUPABASE_URL wird normalisiert — sonst harmloser 400 + Sentry-Noise.
    const baseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const ALLOWED_PREFIX = `${baseUrl}/storage/v1/object/public/`;
    if (!image_url.startsWith(ALLOWED_PREFIX)) {
      return res.status(400).json({ error: 'image_url muss aus Supabase-Storage stammen.' });
    }

    const promptOutside = `Du bist ein strenger Foto-Prüfer bei einer Anhängervermietung. Auf dem Foto MUSS ein PKW-Anhänger (Planenanhänger, Kastenanhänger oder Autotransporter) klar erkennbar sein — typischerweise von der Seite mit Rädern, Deichsel, ggf. Plane.

Antworte AUSSCHLIESSLICH mit gültigem JSON:
{"is_trailer": true/false, "confidence": "high"/"medium"/"low", "reason": "kurze Begründung auf Deutsch"}

is_trailer: true NUR wenn ein PKW-Anhänger eindeutig zu sehen ist (Räder + Deichsel/Zugholm UND Ladefläche/Plane).
is_trailer: false bei:
- Selfies / Personen-Porträts
- Innenräume von Wohnungen / Büros
- Tiere, Essen, Pflanzen, Landschaften ohne Anhänger
- PKWs / LKWs / Anhängerkupplungen am Auto ohne Anhänger
- Spielzeug, Bilder, Cartoons, Memes
- leere Wände, Boden-Nahaufnahmen, Himmel
- andere Anhänger-Typen ohne klare PKW-Anhänger-Charakteristik

Confidence:
- "high" wenn du dir sehr sicher bist (klar PKW-Anhänger oder klar nicht)
- "medium" bei mehrdeutigen Aufnahmen aber identifizierbar
- "low" NUR bei extrem schlechter Bildqualität (komplett dunkel, verwackelt)

Sei konservativ: im Zweifel is_trailer: false mit confidence: medium.`;

    const promptInside = `Du bist ein strenger Foto-Prüfer bei einer Anhängervermietung. Auf dem Foto MUSS die LADEFLÄCHE eines PKW-Anhängers von oben/innen zu sehen sein — also der Boden + Innenseiten der Bordwände.

Antworte AUSSCHLIESSLICH mit gültigem JSON:
{"is_trailer": true/false, "confidence": "high"/"medium"/"low", "reason": "kurze Begründung auf Deutsch"}

is_trailer: true NUR wenn klar Anhänger-Ladefläche (Riffelblech/Holzboden/Metallboden + Bordwände sichtbar).
is_trailer: false bei:
- Selfies / Personen
- Innenräume von Wohnungen / Autos / LKW-Ladeflächen
- Tiere, Essen, Pflanzen
- Strasse, Boden, Beton ohne Bordwände
- Kofferraum vom Auto
- Spielzeug, Bilder, Memes

Confidence:
- "high" wenn klare Anhänger-Ladefläche oder klar etwas anderes
- "medium" bei mehrdeutig identifizierbar
- "low" NUR bei extrem schlechter Bildqualität

Sei konservativ: im Zweifel is_trailer: false mit confidence: medium.`;

    const prompt = expected === 'inside' ? promptInside : promptOutside;

    // Bild als URL an Claude schicken (Claude kann URLs direkt verarbeiten)
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: image_url } },
          { type: 'text', text: prompt }
        ]
      }]
    });

    const text = (msg.content[0]?.text || '').trim();

    // JSON aus der Antwort extrahieren (manchmal mit Code-Block umrahmt)
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      // Fail-open: wenn Parsing schiefgeht, durchlassen
      return res.status(200).json({ ok: true, is_trailer: true, confidence: 'low', reason: 'KI-Antwort nicht parsebar — durchgelassen' });
    }

    return res.status(200).json({
      ok: true,
      is_trailer: parsed.is_trailer !== false,
      confidence: parsed.confidence || 'low',
      reason: parsed.reason || ''
    });

  } catch (err) {
    console.error('validate-photo:', err.message);
    // Fail-open bei API-Fehler
    return res.status(200).json({ ok: true, is_trailer: true, confidence: 'low', reason: 'Validierung übersprungen wegen API-Fehler', error_internal: err.message });
  }
};
