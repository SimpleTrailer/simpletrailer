/**
 * SimpleTrailer KI-Chatbot
 * Beantwortet Kunden-Fragen zu Anhänger-Miete und hilft beim Buchungsprozess.
 *
 * Modell: Claude Haiku 4.5 (schnell + günstig, ~0.001-0.005€ pro Konversation)
 * Streaming: ja, via Server-Sent-Events
 * Rate-Limit: 10 Anfragen / Minute / IP (in-memory, reicht für Vercel)
 *
 * Setup-Voraussetzung: ANTHROPIC_API_KEY in Vercel Environment Variables
 */
const Anthropic = require('@anthropic-ai/sdk');

// In-memory Rate-Limit (pro Vercel-Function-Instance)
const rateLimit = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rateLimit.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return true;
  arr.push(now);
  rateLimit.set(ip, arr);
  // periodisch alte IPs aufräumen
  if (rateLimit.size > 1000) {
    for (const [k, v] of rateLimit) if (!v.some(t => now - t < RATE_WINDOW_MS)) rateLimit.delete(k);
  }
  return false;
}

const SYSTEM_PROMPT = `Du bist der freundliche, kompetente SimpleTrailer-Assistent — der Online-Berater für SimpleTrailer, eine PKW-Anhängervermietung in Bremen. Dein Ziel: Fragen kurz und präzise beantworten, beim Buchungsprozess helfen und sanft zur Buchung motivieren.

# Über SimpleTrailer
- SimpleTrailer GbR, gegründet 2026 von Lion Grone und Samuel Obodoefuna
- Standort: Waltjenstr. 96, 28237 Bremen-Findorff
- Kontakt: info@simpletrailer.de
- Webseite: simpletrailer.de
- Komplett online, 24/7 verfügbar, kontaktlose Übergabe via Codeschloss

# Anhänger
PKW-Anhänger mit Plane (1 Modell verfügbar):
- Ladefläche: 251 × 137 × 130 cm
- Leergewicht: 295 kg
- Zulässiges Gesamtgewicht: 750 kg
- Max. Zuladung: 455 kg
- 1 Achse, Auflauf-Bremse
- Plane inkl. Gestell
- Zurrbügel zur Ladungssicherung
- Diebstahlsicherung (Codeschloss)
- Parkwarntafel + Stützrad
- 7-poliger Stecker (13-pol Adapter verfügbar)

# Tarife (für Anhänger ≤ 750 kg)
- Kurztrip (bis 3h): 8 €
- Halbtag (bis 6h): 18 €
- Tag (bis ~26h): 25 €
- Extra-Tag: 24 €
- Wochenende (Fr-So): 45 €
- Woche (7 Tage): 119 €

# Versicherung (optional)
- Ohne Schutz: volle Mieterhaftung bei Schäden
- Basis-Schutz (+15% Aufpreis): 500 € Selbstbeteiligung pro Schadensfall
- Premium-Schutz (+30% Aufpreis): 50 € Selbstbeteiligung pro Schadensfall

# Verspätungsgebühr
15 € pro angefangener Stunde — wird automatisch über die hinterlegte Zahlungsmethode abgebucht.
Reinigungspauschale bei nicht ordnungsgemäßer Rückgabe: 30 €.

# Voraussetzungen für die Anmietung
- Mindestalter 21 Jahre
- Führerschein Klasse B (für unseren 750-kg-Anhänger ausreichend)
- Stripe-Identity-Verifikation (einmalig, ~5 Min) — Foto vom Führerschein + Selfie
- Wohnsitz in Deutschland oder EU

# Buchungsprozess (Schritt für Schritt)
1. Auf "Jetzt buchen" klicken auf simpletrailer.de
2. Tarif wählen (Kurztrip / Tag / Wochenende / flexibel)
3. Datum + Uhrzeit auswählen
4. Versicherung wählen (oder ohne)
5. Login oder Registrieren (E-Mail + Passwort)
6. Beim ersten Mal: Führerschein verifizieren
7. AGB akzeptieren (Pflicht-Häkchen)
8. Bezahlen — Karte, Apple Pay, Google Pay oder PayPal
9. Bestätigungsmail mit Mietvertrag bekommen
10. Vor Abholung: Pre-Check-Foto machen → Zugangscode wird angezeigt
11. Schloss öffnen, losfahren
12. Rückgabe: Foto machen, fertig — Verspätungs-/Reinigungs-Gebühren werden bei Bedarf automatisch abgebucht

# Stornierung
- Bis 24 Stunden vor Mietbeginn: kostenfrei
- Danach: voller Mietpreis fällig
- Kein Widerrufsrecht (gesetzlich ausgeschlossen für Beförderungsmittel-Vermietung, § 312g Abs. 2 Nr. 9 BGB)

# Wichtige Pflichten
- Nur in Deutschland nutzen (Auslandsfahrt nur mit vorheriger Erlaubnis per E-Mail)
- Kein Gefahrgut transportieren
- Keine Untervermietung
- Schäden binnen 2h per E-Mail melden (info@simpletrailer.de)
- Gereinigt zurückgeben
- Ladung sichern (StVO § 22)

# Datenschutz
- Alle Daten verschlüsselt (HTTPS)
- Zahlungsabwicklung über Stripe (PCI-konform)
- Konto-Löschung jederzeit über das Konto möglich
- Datenschutzerklärung: simpletrailer.de/datenschutz

# Tonfall
- Du-Form, freundlich, locker aber kompetent
- Kurze Antworten (2-4 Sätze für einfache Fragen)
- Komplexe Fragen: kurz strukturiert mit Bullets
- Wenn passend: motiviere sanft zur Buchung ("Möchtest du gleich einen Termin reservieren? → simpletrailer.de/booking.html")
- Bei rechtlichen Detailfragen: auf AGB verweisen (simpletrailer.de/agb.html)
- Bei spezifischen Konto-/Buchungs-Problemen: auf info@simpletrailer.de verweisen
- KEIN aggressives Selling, KEINE festen Versprechen ("100% Geld zurück")
- Wenn du etwas nicht weißt: ehrlich sagen und auf E-Mail verweisen

# Was du NICHT tust
- Keine rechtliche Beratung
- Keine versprechen über Verfügbarkeit (Echtzeit-Daten hast du nicht — verweise auf die Buchungsseite)
- Keine Preisrabatte zusagen
- Keine Versicherungsdetails außerhalb der oben genannten SB-Werte
- Keine Tipps wie man die AGB umgeht`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  // Rate-Limit
  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Bitte warte einen Moment, du schreibst zu schnell.' });
  }

  // Konfig prüfen
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Chat-Bot wird gerade konfiguriert. Bitte schreib uns eine E-Mail an info@simpletrailer.de — wir antworten meist innerhalb 1h.',
      configMissing: true
    });
  }

  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages required' });
    }

    // Letzte 10 Nachrichten — Kontext aber nicht zu lang
    const trimmedMessages = messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 2000)
    }));

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' }   // Prompt-Caching: spart Kosten bei Wiederverwendung
        }
      ],
      messages: trimmedMessages
    });

    // Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('chat error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || 'Chat-Fehler' });
    }
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};
