/**
 * SimpleTrailer Cron: Werbe-Budget-Optimizer (Multi-Agent)
 *
 * Laeuft Sonntags 19:00 UTC (= 21:00 Berlin), eine Stunde nach weekly-advisor.
 * Multi-Agent-Pattern:
 *  Step 1: consultant analysiert Buchungs-Daten + Auslastung der letzten 4 Wochen
 *  Step 2: budget-optimizer-Agent nimmt consultant-Output + Werbe-Spend-Daten,
 *          empfiehlt Tagesbudget pro Kanal
 *  Step 3: Speichert beides als VERKETTETER Insight in ai_insights mit
 *          type='budget-optimizer', cross-references die Datenquellen
 *
 * Inter-Agent-Communication: budget-optimizer kennt alle ai_insights der letzten
 * 7 Tage (consultant, competitor-watcher, midweek-check) und nutzt sie als Kontext.
 */
const { createClient } = require('@supabase/supabase-js');
const { pushLion } = require('../_lion-push.js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function callAnthropic(systemPrompt, userMessage, maxTokens = 2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

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
    // 1) Buchungs-Daten letzten 4 Wochen
    const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString();
    const { data: bookings } = await supabase.from('bookings').select(`
      id, status, total_amount, pricing_type, created_at,
      trailers(name)
    `).gte('created_at', fourWeeksAgo);

    const { data: trailers } = await supabase.from('trailers').select('id, name, is_available');

    const paid = (bookings || []).filter(b => ['confirmed','active','returned'].includes(b.status));
    const totalRevenue = paid.reduce((s, b) => s + (b.total_amount || 0), 0);
    const avgValue = paid.length ? totalRevenue / paid.length : 0;
    const tarifMix = paid.reduce((acc, b) => { acc[b.pricing_type || '?'] = (acc[b.pricing_type || '?'] || 0) + 1; return acc; }, {});

    // 2) Inter-Agent: Letzte 7 Tage AI-Insights als Context
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentInsights } = await supabase.from('ai_insights')
      .select('type, recommendation, agent_name, created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(5);

    const insightContext = (recentInsights || []).map(i =>
      `## ${i.type} (${new Date(i.created_at).toLocaleDateString('de-DE')})\n${i.recommendation.slice(0, 800)}`
    ).join('\n\n');

    // 3) consultant-Brief (Step 1)
    const consultantBrief = await callAnthropic(
      `Du bist consultant fuer SimpleTrailer Bremen. Liefere KOMPAKTES Daten-Briefing in Stichpunkten (max 200 Woerter), das spaeter ein Werbe-Stratege als Input nutzt.`,
      `4-Wochen-Buchungs-Daten:
- Anzahl: ${paid.length}
- Brutto-Umsatz: ${totalRevenue.toFixed(2)} EUR
- Avg Wert: ${avgValue.toFixed(2)} EUR
- Tarif-Mix: ${JSON.stringify(tarifMix)}
- Anhaenger: ${(trailers || []).length} (${(trailers || []).filter(t => t.is_available).length} verfügbar)

Liefere: Was sind die WERBE-RELEVANTEN Insights fuer naechste Woche? Welche Tarife performen? Welche Anhaenger laufen gut/schlecht?`,
      1000
    );

    // 4) budget-optimizer-Empfehlung (Step 2, mit consultant-Output + cross-agent-Context)
    const budgetRecommendation = await callAnthropic(
      `Du bist budget-optimizer fuer SimpleTrailer (Anhaengervermietung Bremen, Live).
Methodik: ROI-basiert. CAC sollte < 30% Marge liegen. Marge ~70% Brutto.

Liefere als HTML (max 500 Woerter) mit:
<h3>🎯 Quick-Take</h3>
<h3>📊 Aktuelle Performance</h3>
<h3>💰 Empfohlenes Tagesbudget</h3> (mit Tabelle Google/Meta/sonst)
<h3>⚡ Aktionen fuer naechste Woche</h3> (3 konkrete)
<h3>⚠️ Was NICHT tun</h3>
<h3>📈 KPIs zum Tracken</h3>

Format: HTML mit <h3>, <p>, <ul>, <table>. Keine <html>/<body>.`,
      `# Daten-Briefing vom consultant (Multi-Agent-Input):
${consultantBrief}

# Andere Agent-Insights letzte 7 Tage (cross-agent context):
${insightContext || '(noch keine)'}

# Aktuelle Werbe-Spend (falls bekannt):
Lion fuegt manuell ein, sonst 0 EUR/Tag (Pre-Launch).

Empfiehl Tagesbudget pro Kanal fuer naechste Woche.`,
      2500
    );

    // 5) In ai_insights speichern (mit Cross-References)
    await supabase.from('ai_insights').insert({
      type: 'budget-optimizer',
      agent_name: 'budget-optimizer',
      recommendation: budgetRecommendation,
      data_snapshot: {
        bookings_4w: paid.length,
        revenue_4w: totalRevenue,
        avg_booking: avgValue,
        tarif_mix: tarifMix,
        trailers_available: (trailers || []).filter(t => t.is_available).length,
        consultant_brief: consultantBrief.slice(0, 500),
        cross_agent_insights_count: (recentInsights || []).length,
      },
    });

    // 6) Cockpit-only — KEINE Mail (nutzt Lion's Anti-Spam-Praeferenz)
    return res.status(200).json({
      ok: true,
      consultant_brief_chars: consultantBrief.length,
      recommendation_chars: budgetRecommendation.length,
      cross_agent_context_items: (recentInsights || []).length,
      stored_in: 'ai_insights (Cockpit)',
    });
  } catch (err) {
    console.error('budget-optimizer:', err);
    return res.status(500).json({ error: err.message });
  }
};
