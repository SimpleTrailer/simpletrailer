/**
 * Sperrzeiten pro Anhänger — gemeinsame Lade-Schicht (Underscore = kein Endpoint).
 *
 * Eine Sperrzeit ist ein Zeitraum, in dem ein Anhänger NICHT vermietet werden
 * darf: Wartung, TÜV, Reparatur, Eigenbedarf. Sie wirkt für die Verfügbarkeit
 * exakt wie eine Buchung, ist aber keine — deshalb eine eigene Tabelle
 * (siehe supabase-migration-sperrzeiten.sql).
 *
 * WARUM DIESE DATEI EXISTIERT: Verfügbarkeit wird an vier Stellen gerechnet
 * (Kalender, Karte, Zahlung, Admin). Läge die Abfrage viermal im Code, würde
 * die vierte Stelle beim nächsten Umbau vergessen — und dann ist ein Anhänger
 * gesperrt, aber trotzdem buchbar. Genau dieser Fehler ist bei
 * trailers.is_available schon einmal passiert.
 *
 * FAIL-SOFT: Fehlt die Tabelle noch (Migration nicht gelaufen), gibt es eine
 * leere Liste statt eines Fehlers. Ein nicht ausgeführter SQL-Schritt darf
 * niemals den Buchungsvorgang lahmlegen.
 */

/**
 * Sperrzeiten laden.
 * @param {object} supabase  Client MIT Service-Key
 * @param {string} [trailerId]  einschränken auf einen Anhänger
 * @param {Date}   [ab]  nur Sperren, die danach noch enden (spart Daten)
 * @returns {Promise<Array<{id, trailer_id, start_time, end_time, reason}>>}
 */
async function loadBlocks(supabase, trailerId, ab) {
  try {
    let q = supabase.from('trailer_blocks').select('id, trailer_id, start_time, end_time, reason');
    if (trailerId) q = q.eq('trailer_id', trailerId);
    if (ab) q = q.gte('end_time', new Date(ab).toISOString());
    const { data, error } = await q.order('start_time', { ascending: true });
    if (error) {
      // 42P01 = Tabelle existiert nicht → Migration steht noch aus.
      if (!/does not exist|42P01/i.test(error.message || '')) {
        console.error('trailer_blocks:', error.message);
      }
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('trailer_blocks:', e.message);
    return [];
  }
}

/** Überschneidet sich [start,end) mit einer der Sperren? */
function blocksOverlap(blocks, start, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return (blocks || []).some(b =>
    new Date(b.start_time).getTime() < e && new Date(b.end_time).getTime() > s
  );
}

module.exports = { loadBlocks, blocksOverlap };
