/**
 * SimpleTrailer PDF-Templates
 * Erzeugt zwei PDFs als Buffer:
 *   - generateMietvertrag(payload) → Mietvertrag-PDF
 *   - generateRechnung(payload)    → Rechnungs-PDF
 *
 * Beide werden in api/booking.js generiert und als Email-Anhang verschickt.
 * pdfkit ist eine pure-Node-Lib (keine Headless-Browser-Dependency) → läuft sauber auf Vercel.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Logo aus dem Webseiten-Root (gemeinsam mit dem Frontend-Logo).
// PDFKit kann PNG-Dateien direkt embedden — wir lesen einmal beim Start ins
// Memory und cachen den Buffer, damit nicht jeder Request die Datei wieder
// von der Disk lädt.
let _logoBuffer = null;
function getLogo() {
  if (_logoBuffer !== null) return _logoBuffer;
  try {
    const p = path.join(__dirname, '..', 'logo.png');
    _logoBuffer = fs.readFileSync(p);
  } catch (e) {
    _logoBuffer = false; // Markiert "tried but failed"
  }
  return _logoBuffer;
}

// ─── Farben & Konstanten ────────────────────────────────────────
const ORANGE = '#E85D00';
const DARK   = '#0D0D0D';
const GREY   = '#666';
const LINE   = '#dddddd';

const COMPANY = {
  name:        'SimpleTrailer GbR',
  partners:    'Lion Grone & Samuel Obodoefuna',
  street:      'Waltjenstr. 96',
  city:        '28237 Bremen',
  email:       'info@simpletrailer.de',
  url:         'simpletrailer.de',
  taxNumber:   '60/176/10854 (Finanzamt Bremen)',
  vatId:       'DE462214434'
};

function fmtDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDateOnly(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE');
}
function fmtEur(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
}

// Buffer-Helper: PDFKit ist Stream-basiert, wir sammeln in Buffer
function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// ─── HEADER (gemeinsam für beide PDFs) ────────────────────────
function drawHeader(doc, title) {
  // Dunkler Banner-Streifen oben — passt zum Webseiten-Design + macht das
  // weiße Logo sichtbar (auf weißem PDF-Hintergrund wäre es nicht lesbar).
  doc.rect(0, 0, 595, 85).fill(DARK);

  const logo = getLogo();
  if (logo && logo !== false) {
    try {
      // Logo links — Höhe 32px, Breite proportional (Original 1600x257)
      doc.image(logo, 50, 28, { height: 32 });
    } catch (e) {
      // Fallback auf Text wenn pdfkit das PNG nicht verarbeiten kann
      doc.fontSize(20).fillColor('#fff').font('Helvetica-Bold').text('Simple', 50, 38, { continued: true });
      doc.fillColor(ORANGE).text('Trailer');
    }
  } else {
    doc.fontSize(20).fillColor('#fff').font('Helvetica-Bold').text('Simple', 50, 38, { continued: true });
    doc.fillColor(ORANGE).text('Trailer');
  }

  // Dokumenttitel rechts auf dem dunklen Banner
  doc.fontSize(9).fillColor('#bbbbbb').font('Helvetica').text(title.toUpperCase(), 380, 45, { width: 165, align: 'right', characterSpacing: 2 });

  // Orange Akzentlinie als Trenner
  doc.rect(0, 85, 595, 3).fill(ORANGE);

  doc.y = 110;
  doc.fillColor(DARK);
}

function drawFooter(doc) {
  // Footer fließt ans Ende des Inhalts (vorher: fixed y=770 → erzwang neue Seite bei vollem PDF).
  // Wenn Restplatz <60pt → ans Seitenende positionieren statt neue Seite zu starten.
  const bottomMargin = 50;
  const footerHeight = 32;
  const remaining = doc.page.height - bottomMargin - doc.y;
  if (remaining < footerHeight + 10) {
    doc.y = doc.page.height - bottomMargin - footerHeight;
  } else {
    doc.moveDown(2);
  }
  doc.fontSize(7).fillColor(GREY).font('Helvetica')
    .text(`${COMPANY.name} · ${COMPANY.partners}`, 50, doc.y, { align: 'center', width: 495 })
    .text(`${COMPANY.street} · ${COMPANY.city} · ${COMPANY.email} · ${COMPANY.url}`, { align: 'center', width: 495 })
    .text(`Steuernummer: ${COMPANY.taxNumber} · USt-IdNr.: ${COMPANY.vatId}`, { align: 'center', width: 495 });
}

function drawKVRow(doc, label, value, opts = {}) {
  const y = doc.y;
  doc.fontSize(9).fillColor(GREY).font('Helvetica').text(label, 50, y, { width: 200 });
  doc.fillColor(opts.color || DARK).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').text(value || '–', 250, y, { width: 295 });
  doc.moveDown(0.5);
}

function drawSection(doc, title) {
  doc.moveDown(0.6);
  doc.fontSize(11).fillColor(ORANGE).font('Helvetica-Bold').text(title.toUpperCase(), 50, doc.y, { characterSpacing: 1.2 });
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

// ─── 1) MIETVERTRAG ─────────────────────────────────────────────
async function generateMietvertrag(p) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: `Mietvertrag #${p.bookingShort}`,
    Author: COMPANY.name,
    Subject: 'Anhänger-Mietvertrag'
  }});

  drawHeader(doc, 'Mietvertrag');

  // Vertrags-Nr + Datum
  doc.fontSize(9).fillColor(GREY).font('Helvetica');
  doc.text(`Vertrags-Nr.: #${p.bookingShort}`, 50, 100);
  doc.text(`Geschlossen am ${fmtDate(p.contractDate)} Uhr`, 400, 100, { width: 145, align: 'right' });
  doc.y = 120;

  drawSection(doc, 'Vertragsparteien');
  doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('Vermieter:', 50, doc.y);
  doc.font('Helvetica').text(`${COMPANY.name}`);
  doc.text(`vertreten durch ${COMPANY.partners}`);
  doc.text(`${COMPANY.street}, ${COMPANY.city}`);
  doc.text(`${COMPANY.email}`);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Mieter:');
  doc.font('Helvetica').text(`${p.customerName}`);
  if (p.customerAddress) doc.text(p.customerAddress);
  doc.text(p.customerEmail);
  if (p.customerPhone) doc.text(p.customerPhone);
  if (p.dlVerified) doc.fillColor('#15803d').font('Helvetica-Bold').text(`✓ Führerschein verifiziert via Stripe Identity am ${fmtDateOnly(p.dlVerifiedAt)}`).fillColor(DARK).font('Helvetica');

  drawSection(doc, 'Mietgegenstand');
  drawKVRow(doc, 'Anhänger',       p.trailerName, { bold: true });
  drawKVRow(doc, 'Kennzeichen',    p.licensePlate);
  drawKVRow(doc, 'Tarif',          p.tariffLabel, { bold: true });
  drawKVRow(doc, 'Mietbeginn',     fmtDate(p.startTime) + ' Uhr', { bold: true });
  drawKVRow(doc, 'Mietende',       fmtDate(p.endTime) + ' Uhr', { bold: true });
  drawKVRow(doc, 'Schutzpaket',    p.insuranceLabel);
  drawKVRow(doc, 'Kostenlose Stornierung', p.cancellationLabel);
  drawKVRow(doc, 'Schloss-Code',   p.accessCode + ' (wird nach Pre-Check freigeschaltet)', { bold: true });
  drawKVRow(doc, 'Rückgabe-Modus', p.returnModeLabel);

  drawSection(doc, 'Pflichten des Mieters');
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica');
  const pflichten = [
    'PRE-CHECK: Vor Abholung ein Foto des Anhängers anfertigen und hochladen. Erst dann wird der Schloss-Code freigeschaltet (frühestens 15 Min vor Mietbeginn).',
    'RÜCKGABE-FOTO: Nach Mietende ein Foto vom Zustand des Anhängers hochladen. Dient als Beweissicherung für beide Vertragsparteien.',
    'FAHRERLAUBNIS: Anhänger nur mit gültiger Fahrerlaubnis der Klasse B oder BE führen. Nicht überladen (max. zulässiges Gesamtgewicht beachten).',
    'LADUNGSSICHERUNG: Ladung gemäß § 22 StVO ordnungsgemäß sichern. Keine Gefahrgüter (ADR-Übereinkommen) transportieren.',
    'KEINE WEITERGABE: Anhänger nicht an Dritte untervermieten oder gewerblich weitergeben.',
    'AUSLAND: Fahrten im Schengen-Raum sind erlaubt, müssen aber vorab per E-Mail an info@simpletrailer.de angezeigt werden — sonst trägt der Mieter das Risiko nicht gedeckter Schäden.',
    'SCHÄDEN MELDEN: Schäden, Unfälle oder technische Probleme innerhalb 2 Stunden per E-Mail an info@simpletrailer.de melden.',
    'RÜCKGABE-ORT: Anhänger am vereinbarten Stellplatz zurückgeben (bei Heimat-Rückgabe ca. 100 m Toleranz). Bei Flex-Rückgabe: irgendwo im Bremer Stadtgebiet auf einem legalen öffentlichen Parkplatz — KEIN Halteverbot, KEIN Privatgrund, KEINE Anwohnerparkzone, KEINE Zeitbegrenzung kürzer 24 h.',
    'REINIGUNG: Anhänger gereinigt zurückgeben. Bei nicht ordnungsgemäßer Reinigung wird die Reinigungspauschale automatisch eingezogen.',
    'GPS-TRACKER: Anhänger ist mit einem Teltonika TAT240 GPS-Tracker ausgestattet. Manipulation, Entfernung, Abdeckung oder Stromlos-Schalten ist verboten.'
  ];
  pflichten.forEach(pf => {
    doc.text(`•  ${pf}`, 50, doc.y, { width: 495, indent: 4, align: 'justify' });
    doc.moveDown(0.25);
  });

  // ─── Detaillierte Gebühren- und Strafen-Übersicht ──────────────
  drawSection(doc, 'Gebühren, Pauschalen und Strafen — vollständige Übersicht');
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica');
  doc.text('Der Mieter trägt folgende Kosten bei Eintritt der jeweiligen Bedingung. Die Beträge werden automatisch über die bei der Buchung hinterlegte Zahlungsmethode eingezogen (§ 5 Abs. 3+4 AGB):', 50, doc.y, { width: 495, align: 'justify' });
  doc.moveDown(0.5);

  const gebuehren = [
    ['Verspätungsgebühr',         '10,00 € pro angefangener Stunde nach vereinbartem Mietende.'],
    ['Reinigungspauschale',       '30,00 € bei nicht ordnungsgemäß gereinigter Rückgabe.'],
    ['Rückführungspauschale',     '50,00 € wenn der Anhänger außerhalb der Rückgabe-Zone abgestellt wird (Bremen-Stadtgebiet bei Flex / 100 m Toleranz beim Heimat-Stellplatz). Bei Entfernungen über 30 km werden zusätzlich die tatsächlichen Kosten (Kraftstoff, Arbeitszeit, Bergung) berechnet.'],
    ['Falsch-Rückgabe / Bußgeld', 'Verwarn- und Bußgelder, Abschlepp-, Standplatz- und Verwahrkosten bei Verstößen gegen die Rückgabe-Regeln (Halteverbot, Privatgrund, Anwohnerparkzone usw.) plus Bearbeitungspauschale 15,00 €.'],
    ['Stornogebühr (ohne Add-On)', '90 % des Mietpreises bei Stornierung oder Nichtantritt. Mit Add-On "Kostenlose Stornierung" entfällt diese Gebühr bis zum Mietbeginn.'],
    ['Schäden ohne Schutzpaket',  'Volle Haftung des Mieters bis zur Schadenshöhe. Im Totalschaden- oder Diebstahlfall können dies bis zu mehrere tausend Euro sein (Wiederbeschaffungswert, Gutachter, Wertminderung, Mietausfall, Bergung).'],
    ['Schäden mit Basis-Schutz',  '500,00 € Selbstbeteiligung pro Schadensfall — bei grober Fahrlässigkeit, Alkohol/Drogen, Überladung oder Weitergabe an Dritte entfällt der Schutz.'],
    ['Schäden mit Premium-Schutz', '50,00 € Selbstbeteiligung pro Schadensfall — gleicher Ausschluss bei grober Fahrlässigkeit etc.'],
    ['Bußgeld-Bearbeitung',       '15,00 € pro Bußgeld-Weiterleitung an Behörden (Verkehrsverstöße, Halteverbot, Park-Verstöße).'],
    ['Tracker-Manipulation',      'Wiederbeschaffungswert des GPS-Trackers ca. 220,00 € zuzüglich Einbaukosten bei Entfernen, Beschädigen oder Stromlos-Setzen.'],
    ['Schloss-/Komponenten-Verlust', 'Tatsächliche Wiederbeschaffungskosten bei Verlust des Schlosses, des Schlüssels oder anderer Komponenten.'],
    ['Information bei Schäden > 200 €', 'Vor Abbuchung von Schadensbeträgen über 200 € erhält der Mieter eine E-Mail mit 5 Werktagen Frist zur Stellungnahme — außer Gefahr im Verzug (z. B. Diebstahl).']
  ];
  gebuehren.forEach(([titel, beschr]) => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fillColor(ORANGE).text(titel, 50, y, { width: 160, continued: false });
    doc.font('Helvetica').fillColor(DARK).text(beschr, 215, y, { width: 330, align: 'justify' });
    doc.moveDown(0.4);
  });

  // Diebstahl-Hinweis
  drawSection(doc, 'Diebstahl und unberechtigte Nutzung');
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica');
  doc.text('Wird der Anhänger außerhalb der gebuchten Mietzeit bewegt oder verlässt er den Rückgabebereich nach Mietende, kann der Vermieter eine unberechtigte Nutzung vermuten und entsprechende Maßnahmen einleiten — insbesondere Polizei-Übermittlung der Position, Strafanzeige und Zurückholen des Anhängers. Der Mieter haftet für Schäden, die durch ein verspätetes Anzeigen eines Verlusts oder Diebstahls entstehen.', 50, doc.y, { width: 495, align: 'justify' });

  drawSection(doc, 'Vertragsschluss & Geltung der AGB');
  doc.fontSize(8.5).fillColor(DARK).font('Helvetica');
  doc.text(`Der Mieter hat die AGB (Stand ${p.agbVersion}) und die Datenschutzerklärung von SimpleTrailer elektronisch akzeptiert und dem sofortigen Vertragsbeginn ausdrücklich zugestimmt. Es besteht kein Widerrufsrecht gem. § 312g Abs. 2 Nr. 9 BGB (Beförderungsmittel-Vermietung für bestimmten Zeitraum). Die jeweils aktuellen AGB sind abrufbar unter ${COMPANY.url}/agb. Bei Widerspruch zwischen diesem Vertragstext und den AGB gehen die Regelungen dieses Vertrags vor; ergänzend gelten die AGB.`, 50, doc.y, { width: 495, align: 'justify' });

  doc.moveDown(1);
  doc.fontSize(8).fillColor(GREY).text(`Dieser Mietvertrag wurde elektronisch geschlossen und ersetzt eine eigenhändige Unterschrift. Die Identitätsfeststellung erfolgte über Stripe Identity (biometrischer Gesichtsabgleich mit dem Lichtbild auf dem Führerschein).`, { width: 495, align: 'center' });

  drawFooter(doc);
  return pdfToBuffer(doc);
}

// ─── 2) RECHNUNG ─────────────────────────────────────────────
async function generateRechnung(p) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: `Rechnung #${p.bookingShort}`,
    Author: COMPANY.name,
    Subject: 'Rechnung'
  }});

  drawHeader(doc, 'Rechnung');

  // Absender (klein, oben)
  doc.fontSize(7).fillColor(GREY).font('Helvetica');
  doc.text(`${COMPANY.name} · ${COMPANY.street} · ${COMPANY.city}`, 50, 95);

  // Empfänger (Brief-Position)
  doc.fontSize(10).fillColor(DARK).font('Helvetica');
  doc.text(p.customerName, 50, 130);
  if (p.customerAddress) doc.text(p.customerAddress);
  doc.text(p.customerEmail);

  // Rechnungs-Meta rechts
  const metaY = 130;
  doc.fontSize(8).fillColor(GREY).font('Helvetica');
  doc.text('Rechnungsnummer', 380, metaY,         { width: 80 });
  doc.text('Rechnungsdatum',  380, metaY + 14,    { width: 80 });
  doc.text('Leistungsdatum',  380, metaY + 28,    { width: 80 });

  doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold');
  doc.text(`#${p.bookingShort}`,         470, metaY,      { width: 75, align: 'right' });
  doc.text(fmtDateOnly(p.contractDate),  470, metaY + 14, { width: 75, align: 'right' });
  doc.text(fmtDateOnly(p.startTime),     470, metaY + 28, { width: 75, align: 'right' });

  doc.y = 200;

  doc.fontSize(12).fillColor(DARK).font('Helvetica-Bold').text(`Rechnung über die Anmietung eines PKW-Anhängers`, 50, 200);
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor(GREY).font('Helvetica').text(`Mietzeitraum: ${fmtDate(p.startTime)} bis ${fmtDate(p.endTime)} Uhr`, 50, doc.y);
  doc.moveDown(1);

  // Positions-Tabelle
  const tableTop = doc.y;
  doc.fontSize(8).fillColor(GREY).font('Helvetica-Bold');
  doc.text('Pos.', 50, tableTop, { width: 30 });
  doc.text('Bezeichnung', 85, tableTop, { width: 290 });
  doc.text('Netto', 380, tableTop, { width: 70, align: 'right' });
  doc.text('USt 19%', 450, tableTop, { width: 50, align: 'right' });
  doc.text('Brutto', 500, tableTop, { width: 45, align: 'right' });
  doc.moveTo(50, tableTop + 13).lineTo(545, tableTop + 13).strokeColor(DARK).lineWidth(0.8).stroke();
  doc.y = tableTop + 18;

  const items = p.items || [];
  let totalNet = 0, totalVat = 0, totalGross = 0;
  doc.fontSize(9).fillColor(DARK).font('Helvetica');
  items.forEach((it, idx) => {
    const y = doc.y;
    const net   = Number(it.gross) / 1.19;
    const vat   = Number(it.gross) - net;
    const gross = Number(it.gross);
    totalNet += net; totalVat += vat; totalGross += gross;
    doc.text(String(idx + 1),         50,  y, { width: 30 });
    doc.text(it.label,                85,  y, { width: 290 });
    doc.text(fmtEur(net),             380, y, { width: 70, align: 'right' });
    doc.text(fmtEur(vat),             450, y, { width: 50, align: 'right' });
    doc.text(fmtEur(gross),           500, y, { width: 45, align: 'right' });
    doc.moveDown(0.8);
  });

  // Summen-Block
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.moveDown(0.4);

  const sumLeft = 350;
  doc.fontSize(9).font('Helvetica').fillColor(GREY);
  doc.text('Summe netto',           sumLeft, doc.y, { width: 150 });
  doc.fillColor(DARK).font('Helvetica-Bold').text(fmtEur(totalNet), sumLeft + 70, doc.y - 11, { width: 125, align: 'right' });
  doc.moveDown(0.4);

  doc.font('Helvetica').fillColor(GREY).text('zzgl. 19 % USt', sumLeft, doc.y, { width: 150 });
  doc.fillColor(DARK).font('Helvetica-Bold').text(fmtEur(totalVat), sumLeft + 70, doc.y - 11, { width: 125, align: 'right' });
  doc.moveDown(0.4);

  doc.moveTo(sumLeft, doc.y).lineTo(545, doc.y).strokeColor(DARK).lineWidth(0.8).stroke();
  doc.moveDown(0.4);

  doc.fontSize(11).font('Helvetica-Bold').fillColor(ORANGE).text('Gesamtbetrag (brutto)', sumLeft, doc.y, { width: 150 });
  doc.text(fmtEur(totalGross), sumLeft + 70, doc.y - 13, { width: 125, align: 'right' });

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#15803d').font('Helvetica-Bold').text(`✓ Bezahlt am ${fmtDateOnly(p.contractDate)} via Stripe (${p.paymentMethod || 'Kreditkarte'})`, 50, doc.y);

  doc.moveDown(1);
  doc.fontSize(8).fillColor(GREY).font('Helvetica');
  doc.text('Diese Rechnung ist eine Rechnung gemäß § 14 UStG. Bei Rückfragen zur Rechnung wende dich bitte an info@simpletrailer.de unter Angabe der Rechnungsnummer.', 50, doc.y, { width: 495, align: 'justify' });

  // Zusatz-Hinweise (Verspätung, Reinigung)
  doc.moveDown(0.8);
  doc.fontSize(8).fillColor(GREY).text('Zusatz-Konditionen (nur fällig bei tatsächlichem Verstoß):', 50, doc.y);
  doc.moveDown(0.2);
  doc.text('• Verspätungsgebühr bei verspäteter Rückgabe: 10,00 € pro angefangener Stunde', { width: 495 });
  doc.text('• Reinigungspauschale bei nicht ordnungsgemäßer Rückgabe: 30,00 €', { width: 495 });
  doc.text('• Rückführungspauschale bei Rückgabe außerhalb der Zone: 50,00 €', { width: 495 });

  drawFooter(doc);
  return pdfToBuffer(doc);
}

module.exports = { generateMietvertrag, generateRechnung };
