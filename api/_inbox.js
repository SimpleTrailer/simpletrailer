/**
 * Agent-Inbox Helper für SimpleTrailer.
 *
 * Statt dass jeder Cron eine Mail per Resend schickt, schreibt er hier rein.
 * Im Admin-Cockpit erscheint dann eine "Agent-Inbox"-Box mit allen Routine-
 * Reports — Lion's Mail-Inbox bleibt sauber.
 *
 * Nutzung:
 *   const { pushToInbox } = require('./_inbox');
 *   await pushToInbox({
 *     agent: 'daily-briefing',
 *     severity: 'info',          // 'info' | 'warn' | 'critical'
 *     title: 'Dein Tagesplan',
 *     summary: '3 Anomalien, 2 Bug-Fixes empfohlen',
 *     bodyHtml: '<p>…</p>',
 *     data: { whatever: 'optional' },
 *   });
 *
 * Fallback: Wenn die agent_messages-Tabelle noch nicht migriert ist
 * (Spalte/Tabelle fehlt), wird das ENTSPRECHENDE Cron-Modul den
 * Rückgabewert {written:false} sehen und kann optional Mail als
 * Safety-Net schicken.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function pushToInbox(payload) {
  const { agent, severity = 'info', title, summary = null, bodyHtml = null, data = null } = payload || {};
  if (!agent || !title) {
    return { written: false, reason: 'missing agent or title' };
  }

  try {
    const { error } = await supabase.from('agent_messages').insert({
      agent_name: agent,
      severity:   ['info', 'warn', 'critical'].includes(severity) ? severity : 'info',
      title:      String(title).slice(0, 500),
      summary:    summary ? String(summary).slice(0, 1000) : null,
      body_html:  bodyHtml || null,
      data_json:  data || null,
    });
    if (error) {
      if (/relation .* does not exist|column .* does not exist/i.test(error.message || '')) {
        console.warn('agent_messages-Tabelle fehlt — bitte supabase-migration-agent-inbox.sql ausführen.');
        return { written: false, reason: 'migration_missing' };
      }
      throw error;
    }
    return { written: true };
  } catch (e) {
    console.error('pushToInbox failed:', e.message);
    return { written: false, reason: e.message };
  }
}

module.exports = { pushToInbox };
