/**
 * SimpleTrailer KI-Chatbot "Simply"
 * Beantwortet Kunden-Fragen, hilft beim Buchungsprozess, prüft live Verfügbarkeit.
 *
 * Modell: Claude Haiku 4.5
 * Tools:  check_availability (ruft live /api/get-availability auf)
 * Streaming: SSE
 * Rate-Limit: 10 Anfragen/Minute/IP
 */
const Anthropic = require('@anthropic-ai/sdk');

// In-memory Rate-Limit
const rateLimit = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rateLimit.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return true;
  arr.push(now);
  rateLimit.set(ip, arr);
  if (rateLimit.size > 1000) {
    for (const [k, v] of rateLimit) if (!v.some(t => now - t < RATE_WINDOW_MS)) rateLimit.delete(k);
  }
  return false;
}

// ========== TOOLS ==========
const TOOLS = [
  {
    name: 'check_availability',
    description: 'Prüft, ob der PKW-Anhänger für einen bestimmten Zeitraum verfügbar ist. Nutze dieses Tool IMMER wenn der Kunde einen konkreten Wunsch-Termin nennt (Datum + Uhrzeit). Du bekommst zurück ob der Termin frei ist oder welche Buchungen kollidieren — dann kannst du dem Kunden direkt sagen ob frei oder belegt.',
    input_schema: {
      type: 'object',
      properties: {
        start_iso: {
          type: 'string',
          description: 'Start-Zeitpunkt im ISO 8601 Format mit Zeitzone Europe/Berlin, z.B. "2026-05-02T10:00:00+02:00" für Samstag 02.05.2026 10:00 Uhr.'
        },
        end_iso: {
          type: 'string',
          description: 'End-Zeitpunkt im ISO 8601 Format mit Zeitzone Europe/Berlin.'
        }
      },
      required: ['start_iso', 'end_iso']
    }
  }
];

async function checkAvailability(start_iso, end_iso) {
  const baseUrl = process.env.SITE_URL || 'https://simpletrailer.de';
  try {
    const res = await fetch(`${baseUrl}/api/get-availability`);
    if (!res.ok) return { error: 'Verfügbarkeits-Check nicht möglich gerade', available: null };
    const data = await res.json();
    const booked = data.booked || [];

    const startMs = new Date(start_iso).getTime();
    const endMs = new Date(end_iso).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      return { error: 'Ungültiger Zeitraum', available: null };
    }

    const conflicts = booked.filter(b => {
      const bStart = new Date(b.start_time).getTime();
      const bEnd = new Date(b.end_time).getTime();
      return bStart < endMs && bEnd > startMs;
    });

    if (conflicts.length === 0) {
      return {
        available: true,
        requested: { start: start_iso, end: end_iso },
        message: 'Der Termin ist frei und kann gebucht werden.'
      };
    }

    return {
      available: false,
      requested: { start: start_iso, end: end_iso },
      conflicts: conflicts.map(c => ({
        belegt_von: c.start_time,
        belegt_bis: c.end_time
      })),
      message: `Termin ist belegt. ${conflicts.length} kollidierende Buchung${conflicts.length > 1 ? 'en' : ''}. Schlage dem Kunden Alternativen vor (z.B. anderen Tag, andere Uhrzeit).`
    };
  } catch (e) {
    return { error: e.message, available: null };
  }
}

// ========== SYSTEM-PROMPT ==========
const SYSTEM_PROMPT = `Du bist **Simply** — der freundliche, kompetente Online-Berater für SimpleTrailer, eine PKW-Anhängervermietung in Bremen. Dein Ziel: Fragen kurz und präzise beantworten, beim Buchungsprozess aktiv helfen und Kunden direkt zur Buchung leiten.

# Über SimpleTrailer
- SimpleTrailer GbR, gegründet 2026 von Lion Grone und Samuel Obodoefuna
- Standort: Waltjenstr. 96, 28237 Bremen-Findorff
- Kontakt: info@simpletrailer.de · simpletrailer.de
- Komplett online, 24/7 verfügbar, kontaktlose Übergabe via Codeschloss

# Anhänger
PKW-Anhänger mit Plane (1 Modell):
- Ladefläche 251×137×130 cm, Leergewicht 295 kg
- zGG 750 kg, Max. Zuladung 455 kg
- Ungebremst (750 kg zGG), Plane inkl. Gestell, Zurrbügel, Codeschloss

# Tarife
- Kurztrip (bis 3h): 9 €
- Halbtag (bis 6h): 18 €
- Tag-Festpreis (24h): 29 €
- Bis 24 Std (flexibler Modus): 29 €
- Jeder weitere Tag: 24 €
- Wochenende (Fr-So): 59 €
- Woche (7 Tage): 119 € (~17 €/Tag, spart 54 € ggü Tag-Tarifen)

# Versicherung (optional)
- Ohne Schutz: volle Mieterhaftung
- Basis-Schutz (+15% Aufpreis): 500 € Selbstbeteiligung
- Premium-Schutz (+30% Aufpreis): 50 € Selbstbeteiligung

# Verspätung & Sonstiges
- 15 €/angefangene Stunde Verspätung (automatisch abgebucht)
- 30 € Reinigungspauschale bei nicht ordentlich zurückgegeben
- Mindestalter 18, Klasse B reicht (Anhänger ≤ 750 kg)
- Stripe-Identity Führerschein-Verifikation einmalig (~5 Min)
- Stornierung: bis 24h vor Mietbeginn kostenfrei

# 🔧 TOOL: VERFÜGBARKEIT PRÜFEN

**Wenn der Kunde einen konkreten Termin nennt (Datum + Uhrzeit), nutze IMMER das Tool \`check_availability\`** — vor dem Buchungs-Link.

Beispiele wann zu checken:
- "Brauche Anhänger Samstag von 10 bis 16" → Tool aufrufen
- "Geht das am 02.05. ganztags?" → Tool aufrufen
- "Wäre nächstes Wochenende frei?" → Tool aufrufen für Fr 18:00 bis So 18:00

Heutiges Datum/Zeit (Europe/Berlin): ${new Date().toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}.

**Bei "Termin ist FREI"**: Kurz bestätigen → Buchungs-Link anbieten.
**Bei "Termin ist BELEGT"**: Sag's freundlich, schlage 1-2 alternative Termine vor (z.B. gleicher Tag andere Uhrzeit, oder Folgetag) — generiere Alternative-Links so dass Kunde nicht selber denken muss.

# 🔗 BUCHUNGS-LINKS GENERIEREN

Format: \`[Jetzt buchen →](/booking.html?...)\`. Parameter:
- **mode**: \`flexible\` | \`weekend\` | \`week\` | \`day\`
- **start_date** / **end_date**: \`YYYY-MM-DD\`
- **start_time** / **end_time**: \`HH:MM\` (24h)
- **insurance**: \`none\` | \`basis\` | \`premium\`

Beispiel — Kunde sagt "Samstag 02.05. von 10-14 Uhr":
\`[Diesen Termin buchen →](/booking.html?mode=flexible&start_date=2026-05-02&end_date=2026-05-02&start_time=10:00&end_time=14:00)\`

# Tonfall & Format
- Du-Form, freundlich, locker aber kompetent
- **Max 3-5 Sätze** für einfache Fragen
- KEINE Rechen-Aufstellungen ("119 € × 0,15 = ..."), nur Endergebnisse
- Markdown wird gerendert: nutze **fett** für Werte, *kursiv* sparsam, KEINE rohen \`**\`-Sterne als Text lassen
- Bei jedem konkreten Termin: erst \`check_availability\` aufrufen, DANN Link
- Max 1 Emoji pro Antwort
- KEIN aggressives Selling, KEINE Versprechen ("100% Geld zurück")

# Was du NICHT tust
- Keine rechtliche Beratung (verweise auf [AGB](/agb.html))
- Keine Konto-/Passwort-Hilfe (verweise auf info@simpletrailer.de)
- Keine Preisrabatte zusagen
- Keine harten Zusagen ohne \`check_availability\`-Tool wenn Termin konkret ist`;

// ========== HANDLER ==========
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Bitte warte einen Moment, du schreibst zu schnell.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Chat-Bot wird gerade konfiguriert. Bitte schreib uns eine E-Mail an info@simpletrailer.de.',
      configMissing: true
    });
  }

  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages required' });
    }

    let conversation = messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 2000)
    }));

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // SSE-Header
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendDelta = (text) => {
      res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
    };
    const sendStatus = (status) => {
      res.write(`data: ${JSON.stringify({ status })}\n\n`);
    };

    // Tool-Loop: max 3 Iterationen (Bot kann theoretisch mehrere Tool-Calls hintereinander machen)
    for (let iter = 0; iter < 3; iter++) {
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages: conversation
      });

      const assistantContent = [];
      let currentTextIdx = -1;
      let currentToolUse = null;
      let toolInputAccum = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            assistantContent.push({ type: 'text', text: '' });
            currentTextIdx = assistantContent.length - 1;
          } else if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              type: 'tool_use',
              id: event.content_block.id,
              name: event.content_block.name,
              input: {}
            };
            toolInputAccum = '';
            // Status an Frontend: Bot prüft Verfügbarkeit
            if (event.content_block.name === 'check_availability') {
              sendStatus('checking_availability');
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            sendDelta(event.delta.text);
            if (currentTextIdx >= 0) assistantContent[currentTextIdx].text += event.delta.text;
          } else if (event.delta.type === 'input_json_delta') {
            toolInputAccum += event.delta.partial_json || '';
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try { currentToolUse.input = JSON.parse(toolInputAccum); } catch (e) { currentToolUse.input = {}; }
            assistantContent.push(currentToolUse);
            currentToolUse = null;
            toolInputAccum = '';
          }
        }
      }

      const finalMsg = await stream.finalMessage();
      conversation.push({ role: 'assistant', content: assistantContent });

      // Wenn kein Tool-Use mehr: fertig
      if (finalMsg.stop_reason !== 'tool_use') break;

      // Tool-Use behandeln
      const toolUseBlocks = assistantContent.filter(c => c.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUseBlocks) {
        let result;
        if (tu.name === 'check_availability') {
          result = await checkAvailability(tu.input.start_iso, tu.input.end_iso);
        } else {
          result = { error: 'unknown tool' };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result)
        });
      }

      conversation.push({ role: 'user', content: toolResults });
      // Loop läuft weiter — Bot bekommt jetzt Tool-Resultate und antwortet damit
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
