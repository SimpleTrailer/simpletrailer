/**
 * SimpleTrailer Cron: Wöchentlicher AI-Berater
 *
 * Läuft Sonntags 18:00 UTC (= 20:00 Berlin) via Vercel Cron.
 *
 * Lädt alle Buchungs-Daten + Tracking-Events der letzten Woche,
 * füttert sie in Claude Haiku 4.5 mit dem consultant-Agent-Prompt,
 * speichert die Empfehlung in Supabase-Tabelle `ai_insights`.
 *
 * Cockpit zeigt sie ab Sonntag-Abend an.
 *
 * VORAUSSETZUNG: Tabelle ai_insights muss in Supabase existieren.
 * SQL liegt in supabase-migration-ai-insights.sql.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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
    // Daten der letzten 4 Wochen sammeln (genug Kontext für Trends)
    const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString();

    const { data: bookings } = await supabase.from('bookings').select(`
      id, status, total_amount, late_fee_amount, pricing_type, insurance_type,
      created_at, start_time, end_time, actual_return_time,
      trailers(name, type)
    `).gte('created_at', fourWeeksAgo);

    const { data: trailers } = await supabase.from('trailers').select('id, name, type, is_available');

    const paid = (bookings || []).filter(b => ['confirmed','active','returned'].includes(b.status));
    const totalBookings = paid.length;
    const totalRevenue = paid.reduce((s,b) => s + (b.total_amount||0), 0);
    const tarifs = {};
    paid.forEach(b => { tarifs[b.pricing_type || '–'] = (tarifs[b.pricing_type || '–']||0) + 1; });
    const insMix = paid.reduce((acc,b) => { const t = b.insurance_type || 'none'; acc[t]=(acc[t]||0)+1; return acc; }, {});

    // Daten-Summary für Claude
    const dataSummary = {
      period: '4 Wochen',
      totalBookings,
      totalRevenueGross: totalRevenue.toFixed(2) + ' €',
      totalRevenueNet: (totalRevenue / 1.19).toFixed(2) + ' €',
      avgBookingValue: totalBookings ? (totalRevenue / totalBookings).toFixed(2) + ' €' : '–',
      tarifDistribution: tarifs,
      insuranceMix: insMix,
      trailerCount: (trailers || []).length,
      availableTrailers: (trailers || []).filter(t => t.is_available).length,
      pendingBookings: (bookings || []).filter(b => b.status === 'pending').length,
    };

    const systemPrompt = `Du bist Senior Strategic Advisor für SimpleTrailer GbR — eine PKW-Anhängervermietung in Bremen, die gerade live geht.

Stack: Vanilla JS Webseite + Vercel + Supabase + Stripe (live), Mobile App (Capacitor) in Entwicklung.
Preise (alle inkl. 19% MwSt): 9€/3h, 18€/6h, 29€/Tag, 59€/Wochenende, 119€/Woche.
Aktuell verfügbar: 1 PKW-Anhänger mit Plane (750kg zGG, ungebremst, führerscheinfrei). Autotransporter + Kofferanhänger "Demnächst".
USPs: 24/7 online buchbar, kontaktlos via Codeschloss, keine Kaution.

Konkurrenz Bremen: HKL (groß, bürokratisch), Boels (Kette, hohe Kaution), Baumärkte (begrenzt). Wir sind das digitale Self-Service-Angebot.

Du bist DIREKT, DATEN-GETRIEBEN, PRAGMATISCH. Kein Marketing-Bullshit.

Liefere als HTML-Snippet (max 500 Wörter) mit Struktur:
1. **Quick-Antwort** (1-2 Sätze: Was ist diese Woche das Wichtigste?)
2. **🎯 Top 3 sofortige Maßnahmen** (mit Aufwand × Effekt)
3. **📊 Was die Daten sagen** (konkrete Beobachtungen)
4. **⚠️ Was Du NICHT machen solltest** (Anti-Empfehlungen)

Format: HTML mit <h3>, <p>, <ul>, <strong>. Keine <html>/<body>-Tags.`;

    const userMessage = `Aktuelle Daten der letzten 4 Wochen:\n\n${JSON.stringify(dataSummary, null, 2)}\n\nWelche 3 konkreten Schritte sollte ich diese Woche angehen, um SimpleTrailer schneller wachsen zu lassen? Berücksichtige: Wir sind frisch live, haben evtl. wenig oder keine Buchungen, brauchen erste Sichtbarkeit + Test-Kunden + Optimierung des Conversion-Funnels.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error: ${anthropicRes.status} ${errText}`);
    }

    const data = await anthropicRes.json();
    const recommendation = data.content?.[0]?.text || '';
    if (!recommendation) throw new Error('No recommendation generated');

    // In ai_insights speichern
    const { error: insertError } = await supabase
      .from('ai_insights')
      .insert({
        type: 'weekly-advisor',
        recommendation,
        data_snapshot: dataSummary,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      // Tabelle fehlt evtl. — zumindest Recommendation zurückgeben
      console.error('ai_insights insert failed:', insertError.message);
      return res.status(200).json({
        ok: true,
        warning: 'ai_insights table missing — recommendation generated but not stored',
        recommendation,
      });
    }

    return res.status(200).json({ ok: true, recommendation_length: recommendation.length });
  } catch (err) {
    console.error('weekly-advisor:', err);
    return res.status(500).json({ error: err.message });
  }
};
