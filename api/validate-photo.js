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

const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { image_url, expected } = req.body || {};
    if (!image_url) return res.status(400).json({ error: 'image_url fehlt' });

    const promptOutside = `Du prüfst ein Foto bei einer Anhängervermietung. Auf dem Foto sollte ein PKW-Anhänger (Planenanhänger oder Autotransporter) VON AUSSEN (Seitenansicht) zu sehen sein.

Antworte AUSSCHLIESSLICH mit gültigem JSON in folgendem Format:
{"is_trailer": true/false, "confidence": "high"/"medium"/"low", "reason": "kurze Begründung auf Deutsch"}

Akzeptiere als Anhänger: PKW-Anhänger (klein, mit oder ohne Plane), Autotransporter, Kastenanhänger, Planenanhänger. Nicht akzeptieren: Selfies, Innenräume, Tiere, Essen, andere Fahrzeuge ohne Anhänger, leere Wände.

Bei sehr schlechter Bildqualität (unscharf, dunkel): confidence "low", aber wenn ein Anhänger erkennbar ist trotzdem is_trailer: true.`;

    const promptInside = `Du prüfst ein Foto bei einer Anhängervermietung. Auf dem Foto sollte die LADEFLÄCHE eines Anhängers von oben zu sehen sein (der Boden des Anhängers, oft mit niedriger Bordwand drumherum).

Antworte AUSSCHLIESSLICH mit gültigem JSON in folgendem Format:
{"is_trailer": true/false, "confidence": "high"/"medium"/"low", "reason": "kurze Begründung auf Deutsch"}

Akzeptiere: leere oder leicht verschmutzte Ladefläche (Metall, Riffelblech, Holzboden), Bordwände sichtbar. Nicht akzeptieren: Selfies, fremde Fahrzeuge, Privat-Innenräume.

Bei sehr schlechter Bildqualität: confidence "low".`;

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
